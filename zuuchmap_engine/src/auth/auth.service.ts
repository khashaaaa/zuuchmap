import {
  Injectable, UnauthorizedException, InternalServerErrorException,
  HttpException, HttpStatus, Logger,
} from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { Cron } from '@nestjs/schedule';
import { InjectRepository } from '@nestjs/typeorm';
import { User } from 'src/user/entities/user.entity';
import { LessThan, Repository } from 'typeorm';
import { incrAndCheckOverLimit } from 'src/utils/rate-counter';
import { isAdmin } from 'src/admin/admin.guard';
import { jwtSecret } from 'src/utils/jwt-secret';
import * as crypto from 'crypto';
import { VerificationSession } from './entities/verification-session.entity';
import { TrustedDevice } from './entities/trusted-device.entity';
import { VerifyMnService } from './verify-mn.service';

const SESSION_TTL = Number(process.env.VERIFY_TTL_MS) || 5 * 60 * 1000;
const RATE_TTL = Number(process.env.RATE_TTL_MS) || 60 * 60 * 1000;
const RATE_LIMIT = Number(process.env.OTP_RATE_LIMIT) || 5;
/** verify.mn 429s a session polled faster than every 2s; stay clear of it. */
const UPSTREAM_POLL_MS = 3_000;

export interface AuthResult {
  user: {
    id: string;
    phone_number: string;
    type: string;
    is_verified: boolean;
    is_admin: boolean;
  };
  token: string;
}

export interface StartResult {
  /** True when the device was already trusted — no SMS, no charge. */
  verified: boolean;
  session_id?: string;
  code?: string;
  shortcode?: string;
  sms_uri?: string;
  display_instruction?: string;
  expires_at?: string;
  auth?: AuthResult;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);

  constructor(
    @InjectRepository(User)
    private userRepository: Repository<User>,
    @InjectRepository(VerificationSession)
    private sessionRepository: Repository<VerificationSession>,
    @InjectRepository(TrustedDevice)
    private deviceRepository: Repository<TrustedDevice>,
    private jwtService: JwtService,
    private verifyMn: VerifyMnService,
  ) { }

  /** Dev convenience only — never active when NODE_ENV=production. */
  private get devMode(): boolean {
    return process.env.NODE_ENV !== 'production' && !this.verifyMn.enabled;
  }

  private hashDevice(deviceId: string): string {
    return crypto.createHash('sha256').update(deviceId).digest('hex');
  }

  private normalizePhone(phone: string): string {
    const digits = (phone ?? '').replace(/\D/g, '').replace(/^976/, '');
    if (!/^\d{8}$/.test(digits)) {
      throw new HttpException('Enter a valid 8-digit Mongolian number.', HttpStatus.BAD_REQUEST);
    }
    return digits;
  }

  /**
   * Step 1. Either hands back an authenticated session (device already trusted)
   * or registers a verify.mn session the user completes by SMS.
   */
  async startVerification(rawPhone: string, deviceId?: string): Promise<StartResult> {
    const phone_number = this.normalizePhone(rawPhone);
    const device_hash = deviceId ? this.hashDevice(deviceId) : undefined;

    // Known device on an existing account: skip SMS entirely (and its 150₮).
    if (device_hash) {
      const user = await this.userRepository.findOne({ where: { phone_number } });
      if (user) {
        const trusted = await this.deviceRepository.findOne({
          where: { user: { id: user.id }, device_hash },
          relations: ['user'],
        });
        if (trusted) {
          trusted.last_seen_at = new Date();
          await this.deviceRepository.save(trusted);
          return { verified: true, auth: await this.issueSession(user) };
        }
      }
    }

    // Per-phone hourly cap on paid SMS verifications — shared across instances
    // via Redis (falls back to in-process when Redis is off).
    if (await incrAndCheckOverLimit(phone_number, RATE_LIMIT, RATE_TTL)) {
      throw new HttpException(
        {
          message: 'Too many verification attempts. Try again in an hour.',
          code: 'TOO_MANY_VERIFICATIONS',
        },
        HttpStatus.TOO_MANY_REQUESTS,
      );
    }

    const code = crypto.randomInt(100000, 999999).toString();
    const expires_at = new Date(Date.now() + SESSION_TTL);

    const session = this.sessionRepository.create({
      phone_number,
      code,
      status: 'PENDING',
      device_hash,
      expires_at,
    });
    await this.sessionRepository.save(session);

    if (this.devMode) {
      this.logger.warn(`DEV verification session ${session.id} — code ${code}, auto-verifies on first poll.`);
      return {
        verified: false,
        session_id: session.id,
        code,
        shortcode: '144773',
        sms_uri: `sms:144773?body=${code}`,
        display_instruction: `[DEV] No SMS needed — this verifies automatically.`,
        expires_at: expires_at.toISOString(),
      };
    }

    const callback = `${this.callbackBase()}/auth/verify/callback/${session.id}`;
    const remote = await this.verifyMn.createSession(phone_number, code, callback);

    session.provider_session_id = remote.sessionId;
    session.expires_at = new Date(remote.expiresAt);
    await this.sessionRepository.save(session);

    return {
      verified: false,
      session_id: session.id,
      code: remote.text,
      shortcode: remote.shortcode,
      sms_uri: remote.smsUri,
      display_instruction: remote.displayInstruction,
      expires_at: remote.expiresAt,
    };
  }

  private callbackBase(): string {
    const base = process.env.PUBLIC_ENGINE_URL;
    if (!base) {
      throw new InternalServerErrorException(
        'PUBLIC_ENGINE_URL must be set so verify.mn can reach the callback.',
      );
    }
    return base.replace(/\/$/, '');
  }

  /**
   * Step 2. Client polls this. Returns a token the moment verify.mn confirms
   * the SMS arrived from the claimed number.
   */
  async checkVerification(sessionId: string): Promise<{ status: string; auth?: AuthResult }> {
    const session = await this.sessionRepository.findOne({ where: { id: sessionId } });
    if (!session) throw new HttpException('Verification session not found.', HttpStatus.NOT_FOUND);

    if (session.status === 'CONSUMED') {
      throw new HttpException('This verification was already used.', HttpStatus.GONE);
    }

    const status = await this.refreshStatus(session);
    // Only the polling client consumes a session — see `handleCallback`.
    if (status === 'VERIFIED') {
      return { status, auth: await this.completeSession(session) };
    }
    return { status };
  }

  /**
   * Brings `session.status` up to date with verify.mn. Deliberately stops short
   * of `completeSession`: reading the outcome and spending it are separate acts,
   * and only the caller holding the client connection may spend it.
   */
  private async refreshStatus(
    session: VerificationSession,
    { force = false }: { force?: boolean } = {},
  ): Promise<'PENDING' | 'VERIFIED' | 'EXPIRED'> {
    if (session.status === 'VERIFIED') return 'VERIFIED';

    if (session.expires_at.getTime() < Date.now()) {
      if (session.status !== 'EXPIRED') {
        session.status = 'EXPIRED';
        await this.sessionRepository.save(session);
      }
      return 'EXPIRED';
    }

    if (this.devMode && !session.provider_session_id) {
      session.status = 'VERIFIED';
      session.verified_at = new Date();
      await this.sessionRepository.save(session);
      return 'VERIFIED';
    }

    // Respect the upstream rate limit — poll verify.mn at most every 3s per
    // session. A provider callback is exempt: it fires because something
    // actually changed, so throttling it just wastes the nudge.
    const since = session.last_checked_at ? Date.now() - session.last_checked_at.getTime() : Infinity;
    if (!force && since < UPSTREAM_POLL_MS) return 'PENDING';

    session.last_checked_at = new Date();
    await this.sessionRepository.save(session);

    const remote = await this.verifyMn.getStatus(session.provider_session_id);

    if (remote.sessionStatus === 'VERIFIED') {
      session.status = 'VERIFIED';
      session.verified_at = remote.verifiedAt ? new Date(remote.verifiedAt) : new Date();
      await this.sessionRepository.save(session);
      return 'VERIFIED';
    }

    if (remote.sessionStatus === 'EXPIRED') {
      session.status = 'EXPIRED';
      await this.sessionRepository.save(session);
      return 'EXPIRED';
    }

    return 'PENDING';
  }

  /**
   * Wake-up nudge from verify.mn. Records the outcome so the client's next poll
   * finds it immediately, and stops there.
   *
   * It must never call `completeSession`: that marks the session CONSUMED, and
   * the token it mints here has no caller to return to. The client's next poll
   * would then be answered with 410 — telling someone who verified correctly,
   * and paid 150₮ to do it, to start over and pay again.
   */
  async handleCallback(sessionId: string): Promise<void> {
    try {
      const session = await this.sessionRepository.findOne({ where: { id: sessionId } });
      if (!session || session.status === 'CONSUMED') return;
      await this.refreshStatus(session, { force: true });
    } catch (err) {
      this.logger.warn(`Callback check for ${sessionId} failed: ${err?.message}`);
    }
  }

  /** Creates the user on first verification, trusts the device, mints the token. */
  private async completeSession(session: VerificationSession): Promise<AuthResult> {
    let user = await this.userRepository.findOne({ where: { phone_number: session.phone_number } });
    if (!user) {
      user = this.userRepository.create({ phone_number: session.phone_number, is_verified: true });
      await this.userRepository.save(user);
    } else if (!user.is_verified) {
      user.is_verified = true;
      await this.userRepository.save(user);
    }

    if (session.device_hash) {
      const existing = await this.deviceRepository.findOne({
        where: { user: { id: user.id }, device_hash: session.device_hash },
      });
      if (existing) {
        existing.last_seen_at = new Date();
        await this.deviceRepository.save(existing);
      } else {
        await this.deviceRepository.save(
          this.deviceRepository.create({
            user,
            device_hash: session.device_hash,
            last_seen_at: new Date(),
          }),
        );
      }
    }

    session.status = 'CONSUMED';
    await this.sessionRepository.save(session);

    return this.issueSession(user);
  }

  private async issueSession(user: User): Promise<AuthResult> {
    return {
      user: {
        id: user.id,
        phone_number: user.phone_number,
        type: user.type,
        is_verified: user.is_verified,
        is_admin: isAdmin(user.phone_number),
      },
      token: await this.generateToken(user),
    };
  }

  async generateToken(user: User): Promise<string> {
    return this.jwtService.sign(
      { sub: user.id, phone: user.phone_number, type: user.type },
      { secret: jwtSecret(), expiresIn: '30d' },
    );
  }

  /** Nightly housekeeping — keeps the session table from growing forever. */
  @Cron('30 0 * * *')
  async pruneSessions(): Promise<void> {
    await this.sessionRepository.delete({
      expires_at: LessThan(new Date(Date.now() - 24 * 60 * 60 * 1000)),
    });
  }

  async validateUser(userId: string): Promise<User> {
    const user = await this.userRepository.findOne({
      where: { id: userId },
      relations: ['company'],
    });
    if (!user) throw new UnauthorizedException('Invalid token');
    return user;
  }
}
