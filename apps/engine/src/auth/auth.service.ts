import { createHash, randomInt } from 'node:crypto';
import {
  GoneException,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  ServiceUnavailableException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, type Repository } from 'typeorm';
import type { AuthResponse, VerifyStartResponse, VerifyStatus, VerifyStatusResponse } from '@zuuchmap/core';
import { RedisService } from '../redis/redis.service';
import { User } from '../user/entities/user.entity';
import { UserService } from '../user/user.service';
import { AUTH_CONFIG, isAdminPhone, type AuthConfig } from './auth.config';
import { TrustedDevice } from './entities/trusted-device.entity';
import { VerificationSession } from './entities/verification-session.entity';
import { openSession, type RequestUser } from './request-user';
import { normalizePhone } from './phone';
import { VerifyMnService } from './verify-mn.service';

/** verify.mn answers 429 to a session polled faster than every 2s. */
const UPSTREAM_POLL_MS = 3_000;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function hashDevice(deviceId: string): string {
  return createHash('sha256').update(deviceId).digest('hex');
}

@Injectable()
export class AuthService {
  private readonly log = new Logger(AuthService.name);

  constructor(
    private readonly ds: DataSource,
    @InjectRepository(VerificationSession) private readonly sessions: Repository<VerificationSession>,
    @InjectRepository(TrustedDevice) private readonly devices: Repository<TrustedDevice>,
    private readonly users: UserService,
    private readonly verifyMn: VerifyMnService,
    private readonly redis: RedisService,
    @Inject(AUTH_CONFIG) private readonly cfg: AuthConfig,
  ) {}

  /**
   * Either answers with a token (known device on an existing account: no text, no 150 MNT)
   * or registers a verification session the user completes by texting the code.
   */
  async startVerification(rawPhone: string, deviceId?: string): Promise<VerifyStartResponse> {
    const phone = normalizePhone(rawPhone);
    if (!phone) throw new BadRequestException('Enter a valid 8-digit Mongolian number');
    const deviceHash = deviceId ? hashDevice(deviceId) : null;

    if (deviceHash) {
      const user = await this.users.findByPhone(phone);
      if (user && (await this.touchTrustedDevice(user.id, deviceHash))) {
        return { ...emptyStart(), verified: true, auth: await this.issue(user, this.ds.manager) };
      }
    }

    if (!this.cfg.devMode && !this.verifyMn.enabled) {
      throw new ServiceUnavailableException('SMS verification is not configured');
    }

    const hits = await this.redis.hit(`verify:${phone}`, this.cfg.rateTtlMs);
    if (hits > this.cfg.rateLimit) {
      throw new HttpException(
        { message: 'Too many verification attempts, try again later', code: 'TOO_MANY_VERIFICATIONS' },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = String(randomInt(100000, 1000000));
    const session = await this.sessions.save(
      this.sessions.create({
        phone_number: phone,
        code,
        status: 'PENDING',
        device_hash: deviceHash,
        expires_at: new Date(Date.now() + this.cfg.verifyTtlMs),
      }),
    );

    if (this.cfg.devMode) {
      this.log.warn(`DEV verification session ${session.id}: code ${code}, auto-verifies on first poll`);
      return {
        ...emptyStart(),
        session_id: session.id,
        code,
        shortcode: this.cfg.shortcode,
        sms_uri: `sms:${this.cfg.shortcode}?body=${code}`,
        expires_at: session.expires_at.toISOString(),
      };
    }

    const remote = await this.verifyMn.createSession(
      phone,
      code,
      `${this.cfg.callbackBase}/auth/verify/callback/${session.id}`,
    );
    const expiresAt = new Date(remote.expiresAt);
    await this.sessions.update(session.id, { provider_session_id: remote.sessionId, expires_at: expiresAt });
    return {
      ...emptyStart(),
      session_id: session.id,
      code: remote.text,
      shortcode: remote.shortcode,
      sms_uri: remote.smsUri,
      expires_at: expiresAt.toISOString(),
    };
  }

  /** The client polls this; the poll that sees VERIFIED spends the session and gets the token. */
  async checkVerification(sessionId: string): Promise<VerifyStatusResponse> {
    const session = UUID.test(sessionId) ? await this.sessions.findOne({ where: { id: sessionId } }) : null;
    if (!session) throw new NotFoundException('Verification session not found');
    if (session.status === 'CONSUMED') throw new GoneException('This verification was already used');

    const status = await this.refresh(session, false);
    if (status === 'VERIFIED') {
      return { status, auth: await this.spend(session) };
    }
    return { status, auth: null };
  }

  /**
   * Brings the session up to date. Reading the outcome and spending it are separate acts;
   * only the polling client spends, so a callback never burns a token nobody receives.
   */
  private async refresh(session: VerificationSession, force: boolean): Promise<VerifyStatus> {
    if (session.status === 'VERIFIED') return 'VERIFIED';
    if (session.status === 'EXPIRED') return 'EXPIRED';

    if (session.expires_at.getTime() <= Date.now()) {
      await this.settle(session, { status: 'EXPIRED' });
      return 'EXPIRED';
    }

    if (this.cfg.devMode && !session.provider_session_id) {
      await this.settle(session, { status: 'VERIFIED', verified_at: new Date() });
      return 'VERIFIED';
    }
    if (!session.provider_session_id) return 'PENDING';

    const since = session.last_checked_at ? Date.now() - session.last_checked_at.getTime() : Infinity;
    if (!force && since < UPSTREAM_POLL_MS) return 'PENDING';
    await this.sessions.update(session.id, { last_checked_at: new Date() });

    const remote = await this.verifyMn.getStatus(session.provider_session_id);
    if (remote.sessionStatus === 'VERIFIED') {
      await this.settle(session, {
        status: 'VERIFIED',
        verified_at: remote.verifiedAt ? new Date(remote.verifiedAt) : new Date(),
      });
      return 'VERIFIED';
    }
    if (remote.sessionStatus === 'EXPIRED') {
      await this.settle(session, { status: 'EXPIRED' });
      return 'EXPIRED';
    }
    return 'PENDING';
  }

  /** Moves a session off PENDING and only off PENDING: a spent session can never be revived. */
  private async settle(
    session: VerificationSession,
    fields: Partial<Pick<VerificationSession, 'status' | 'verified_at'>>,
  ): Promise<void> {
    const res = await this.sessions.update({ id: session.id, status: 'PENDING' }, fields);
    if (res.affected) Object.assign(session, fields);
    else {
      const fresh = await this.sessions.findOne({ where: { id: session.id } });
      if (fresh) Object.assign(session, fresh);
    }
  }

  /** verify.mn nudge: records the outcome so the next poll finds it; never spends. */
  async handleCallback(sessionId: string): Promise<void> {
    try {
      if (!UUID.test(sessionId)) return;
      const session = await this.sessions.findOne({ where: { id: sessionId } });
      if (!session || session.status === 'CONSUMED') return;
      await this.refresh(session, true);
    } catch (err) {
      this.log.warn(`callback ${sessionId} failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  /**
   * Spends a VERIFIED session with ONE conditional update (exactly one concurrent caller
   * wins), then creates/loads the user and trusts the device in the same transaction, so a
   * failure leaves the session spendable rather than burned.
   */
  private async spend(session: VerificationSession): Promise<AuthResponse> {
    return this.ds.transaction(async (m: EntityManager) => {
      const claim = await m
        .createQueryBuilder()
        .update(VerificationSession)
        .set({ status: 'CONSUMED' })
        .where('id = :id AND status = :s', { id: session.id, s: 'VERIFIED' })
        .execute();
      if (!claim.affected) throw new GoneException('This verification was already used');

      const user = await this.users.findOrCreateByPhone(session.phone_number, m);
      if (session.device_hash) await this.trustDevice(m, user.id, session.device_hash);
      return this.issue(user, m);
    });
  }

  private async trustDevice(m: EntityManager, userId: string, deviceHash: string): Promise<void> {
    await m
      .createQueryBuilder()
      .insert()
      .into(TrustedDevice)
      .values({ user_id: userId, device_hash: deviceHash, last_seen_at: new Date() })
      .orUpdate(['last_seen_at'], ['user_id', 'device_hash'])
      .execute();
  }

  /** True (and refreshes last_seen) when the device was verified within the last year. */
  private async touchTrustedDevice(userId: string, deviceHash: string): Promise<boolean> {
    const res = await this.devices
      .createQueryBuilder()
      .update(TrustedDevice)
      .set({ last_seen_at: new Date() })
      .where('user_id = :userId AND device_hash = :deviceHash AND last_seen_at > :cutoff', {
        userId,
        deviceHash,
        cutoff: new Date(Date.now() - YEAR_MS),
      })
      .execute();
    return Boolean(res.affected);
  }

  async issue(user: User, m: EntityManager): Promise<AuthResponse> {
    const admin = isAdminPhone(this.cfg, user.phone_number);
    return {
      user: {
        id: user.id,
        phone_number: user.phone_number,
        type: user.type === 'PROVIDER' ? 'PROVIDER' : 'CUSTOMER',
        is_verified: user.is_verified,
        is_admin: admin,
      },
      token: await openSession(m, user.id, this.cfg),
    };
  }

  /** Ends this token's session; with a device id, also forgets the device (web: shared computers). */
  async signOut(me: RequestUser, deviceId?: string): Promise<void> {
    await this.ds.query('DELETE FROM auth_sessions WHERE id = $1', [me.session_id]);
    if (!deviceId) return;
    const userId = me.id;
    await this.devices.delete({ user_id: userId, device_hash: hashDevice(deviceId) });
  }
}

function emptyStart(): VerifyStartResponse {
  return { verified: false, session_id: null, code: null, shortcode: null, sms_uri: null, expires_at: null, auth: null };
}
