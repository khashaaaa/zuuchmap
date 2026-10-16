import { HttpException, HttpStatus, Inject, Injectable, Logger } from '@nestjs/common';
import { AUTH_CONFIG, type AuthConfig } from './auth.config';

export interface VerifySession {
  sessionId: string;
  phone: string;
  shortcode: string;
  text: string;
  smsUri: string;
  displayInstruction?: string;
  expiresAt: string;
}

export interface VerifyStatusReply {
  sessionId: string;
  sessionStatus: 'PENDING' | 'VERIFIED' | 'EXPIRED';
  verifiedAt?: string;
  expiresAt: string;
}

/**
 * Thin verify.mn client. We never send an SMS: we register a code, the user texts it to the
 * shortcode from the phone being claimed, and the arrival proves possession. Inert (and
 * `enabled === false`) when no API key is configured.
 */
@Injectable()
export class VerifyMnService {
  private readonly log = new Logger(VerifyMnService.name);

  constructor(@Inject(AUTH_CONFIG) private readonly cfg: AuthConfig) {}

  get enabled(): boolean {
    return Boolean(this.cfg.verifyMn.apiKey);
  }

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const key = this.cfg.verifyMn.apiKey;
    if (!key) {
      throw new HttpException('SMS verification is not configured', HttpStatus.SERVICE_UNAVAILABLE);
    }
    const controller = new AbortController();
    const timer = setTimeout(() => {
      controller.abort();
    }, this.cfg.verifyMn.timeoutMs);
    try {
      const res = await fetch(`${this.cfg.verifyMn.baseUrl}${path}`, {
        ...init,
        headers: { ...(init.headers as Record<string, string> | undefined), Authorization: `Bearer ${key}` },
        signal: controller.signal,
      });
      if (!res.ok) {
        this.log.warn(`verify.mn ${init.method ?? 'GET'} ${path} -> ${String(res.status)}`);
        if (res.status === 401) throw new HttpException('SMS provider rejected our credentials', 503);
        if (res.status === 429) throw new HttpException('Checked too quickly, try again in a few seconds', 429);
        if (res.status === 404) throw new HttpException('Verification session not found', 404);
        throw new HttpException('SMS provider error', HttpStatus.BAD_GATEWAY);
      }
      return (await res.json()) as T;
    } catch (err) {
      if (err instanceof HttpException) throw err;
      if (err instanceof Error && err.name === 'AbortError') {
        throw new HttpException('SMS provider timed out', HttpStatus.GATEWAY_TIMEOUT);
      }
      this.log.error(`verify.mn ${path} failed: ${err instanceof Error ? err.message : String(err)}`);
      throw new HttpException('SMS provider unreachable', HttpStatus.BAD_GATEWAY);
    } finally {
      clearTimeout(timer);
    }
  }

  createSession(phone: string, text: string, callback: string): Promise<VerifySession> {
    return this.request<VerifySession>('/sessions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ phone, text, callback }),
    });
  }

  /** Authoritative status; the callback has no body or signature and is only a nudge. */
  getStatus(providerSessionId: string): Promise<VerifyStatusReply> {
    return this.request<VerifyStatusReply>(`/sessions/${encodeURIComponent(providerSessionId)}`, { method: 'GET' });
  }
}
