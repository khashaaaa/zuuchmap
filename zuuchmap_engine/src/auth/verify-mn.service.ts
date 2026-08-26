import { HttpException, HttpStatus, Injectable, Logger } from '@nestjs/common';

const BASE_URL = process.env.VERIFY_MN_BASE_URL ?? 'https://api.verify.mn';
const TIMEOUT_MS = Number(process.env.VERIFY_MN_TIMEOUT_MS) || 10_000;

export interface VerifySession {
  sessionId: string;
  phone: string;
  shortcode: string;
  text: string;
  smsUri: string;
  displayInstruction: string;
  expiresAt: string;
}

export interface VerifyStatus {
  sessionId: string;
  phone: string;
  sessionStatus: 'PENDING' | 'VERIFIED' | 'EXPIRED';
  callbackStatus: 'PENDING' | 'SENT' | 'FAILED';
  verifiedAt?: string;
  expiresAt: string;
}

/**
 * Thin client for verify.mn — Mongolia's Mobile-Originated SMS verification API.
 *
 * Flow is inverted from a normal OTP: we do not send anything to the user.
 * We register a code, the user texts that code to shortcode 144773 from the
 * phone being claimed, and possession is proven by the SMS arriving from that
 * number. The code is therefore not a secret and is safe to render in the UI.
 */
@Injectable()
export class VerifyMnService {
  private readonly logger = new Logger(VerifyMnService.name);

  /** True when a real API key is configured; otherwise callers must use dev fallback. */
  get enabled(): boolean {
    return Boolean(process.env.VERIFY_MN_API_KEY);
  }

  private apiKey(): string {
    const key = process.env.VERIFY_MN_API_KEY;
    if (!key) {
      throw new HttpException(
        'SMS verification is not configured (VERIFY_MN_API_KEY missing).',
        HttpStatus.SERVICE_UNAVAILABLE,
      );
    }
    return key;
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
    try {
      const res = await fetch(`${BASE_URL}${path}`, {
        ...init,
        signal: controller.signal,
      });
      const body = await res.text();

      if (!res.ok) {
        // Never log the key; log status + path only.
        this.logger.warn(
          `verify.mn ${init.method ?? 'GET'} ${path} → ${res.status}`,
        );
        if (res.status === 401) {
          throw new HttpException(
            'SMS provider rejected our credentials.',
            HttpStatus.SERVICE_UNAVAILABLE,
          );
        }
        if (res.status === 429) {
          throw new HttpException(
            'Checked too quickly. Try again in a few seconds.',
            HttpStatus.TOO_MANY_REQUESTS,
          );
        }
        if (res.status === 404) {
          throw new HttpException(
            'Verification session not found.',
            HttpStatus.NOT_FOUND,
          );
        }
        throw new HttpException('SMS provider error.', HttpStatus.BAD_GATEWAY);
      }

      return JSON.parse(body) as T;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      if (err?.name === 'AbortError') {
        throw new HttpException(
          'SMS provider timed out.',
          HttpStatus.GATEWAY_TIMEOUT,
        );
      }
      this.logger.error(`verify.mn ${path} failed: ${err?.message}`);
      throw new HttpException(
        'SMS provider unreachable.',
        HttpStatus.BAD_GATEWAY,
      );
    } finally {
      clearTimeout(timer);
    }
  }

  /** Registers a code the user must SMS to the shortcode. */
  async createSession(
    phone: string,
    text: string,
    callback: string,
  ): Promise<VerifySession> {
    return this.request<VerifySession>('/sessions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${this.apiKey()}`,
      },
      body: JSON.stringify({ phone, text, callback }),
    });
  }

  /**
   * Authoritative status. The callback carries no body and no signature, so it
   * is only ever a "check now" nudge — this call is what we actually trust.
   */
  async getStatus(sessionId: string): Promise<VerifyStatus> {
    return this.request<VerifyStatus>(
      `/sessions/${encodeURIComponent(sessionId)}`,
      { method: 'GET' },
    );
  }
}
