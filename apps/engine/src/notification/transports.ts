import { Injectable, Logger } from '@nestjs/common';
import { createTransport, type Transporter } from 'nodemailer';
import webpush from 'web-push';
import type { PushPayload, PushProvider } from '@zuuchmap/core';
import { env } from '../config/env';

export const NOTIFY_TRANSPORTS = Symbol('NOTIFY_TRANSPORTS');

export interface OutboundPush {
  provider: PushProvider;
  token: string;
  keys: { p256dh: string; auth: string } | null;
  title: string;
  body: string;
  /** The tap target travels with it; `url` is the web route (web push opens it). */
  data: PushPayload & { url: string };
}

export interface OutboundMail { to: string; subject: string; text: string; html: string }

/** The outside world. Tests swap in a recorder; each transport is inert while unconfigured. */
export interface NotifyTransports {
  /** Sends what it can; answers the tokens the service said are gone for good. */
  push(messages: OutboundPush[]): Promise<{ dead: string[] }>;
  mail(message: OutboundMail): Promise<void>;
  readonly webPushKey: string | null;
  readonly mailEnabled: boolean;
}

const EXPO_URL = 'https://exp.host/--/api/v2/push/send';
const EXPO_BATCH = 100;

interface ExpoTicket { status: 'ok' | 'error'; message?: string; details?: { error?: string } }

/** Expo push (the app), web push with VAPID (browsers), SMTP (accounts with no device). */
@Injectable()
export class LiveNotifyTransports implements NotifyTransports {
  private readonly log = new Logger('Notify');
  private readonly mailer: Transporter | null;
  readonly webPushKey: string | null;
  readonly mailEnabled: boolean;

  constructor() {
    const e = env();
    if (e.VAPID) webpush.setVapidDetails(e.VAPID.subject, e.VAPID.publicKey, e.VAPID.privateKey);
    this.webPushKey = e.VAPID?.publicKey ?? null;
    this.mailer = e.SMTP
      ? createTransport({ host: e.SMTP.host, port: e.SMTP.port, secure: e.SMTP.secure, auth: e.SMTP.user ? { user: e.SMTP.user, pass: e.SMTP.pass } : undefined })
      : null;
    this.mailEnabled = this.mailer !== null;
  }

  async push(messages: OutboundPush[]): Promise<{ dead: string[] }> {
    const [expo, web] = [messages.filter((m) => m.provider === 'EXPO'), messages.filter((m) => m.provider === 'WEB')];
    const dead = [...(await this.expo(expo)), ...(await this.web(web))];
    return { dead };
  }

  private async expo(messages: OutboundPush[]): Promise<string[]> {
    const dead: string[] = [];
    for (let i = 0; i < messages.length; i += EXPO_BATCH) {
      const batch = messages.slice(i, i + EXPO_BATCH);
      try {
        const res = await fetch(EXPO_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Accept: 'application/json',
            ...(env().EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${env().EXPO_ACCESS_TOKEN as string}` } : {}),
          },
          body: JSON.stringify(batch.map((m) => ({
            to: m.token, title: m.title, body: m.body, data: m.data, sound: 'default', channelId: 'default', priority: 'high',
          }))),
          signal: AbortSignal.timeout(10_000),
        });
        const json = (await res.json().catch(() => null)) as { data?: ExpoTicket[] } | null;
        if (!res.ok || !json?.data) {
          this.log.warn(`expo push ${String(res.status)}`);
          continue;
        }
        json.data.forEach((ticket, j) => {
          if (ticket.status === 'error') {
            if (ticket.details?.error === 'DeviceNotRegistered') dead.push(batch[j].token);
            else this.log.warn(`expo push: ${ticket.message ?? ticket.details?.error ?? 'error'}`);
          }
        });
      } catch (e) {
        this.log.warn(`expo push failed: ${e instanceof Error ? e.message : String(e)}`);
      }
    }
    return dead;
  }

  private async web(messages: OutboundPush[]): Promise<string[]> {
    if (!this.webPushKey) return [];
    const dead: string[] = [];
    await Promise.all(messages.map(async (m) => {
      if (!m.keys) return;
      try {
        await webpush.sendNotification(
          { endpoint: m.token, keys: m.keys },
          JSON.stringify({ title: m.title, body: m.body, data: m.data }),
          { TTL: 24 * 60 * 60, timeout: 10_000 },
        );
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) dead.push(m.token);
        else this.log.warn(`web push failed: ${String(status ?? (e instanceof Error ? e.message : e))}`);
      }
    }));
    return dead;
  }

  async mail(message: OutboundMail): Promise<void> {
    if (!this.mailer) return;
    try {
      await this.mailer.sendMail({ from: env().SMTP?.from, ...message });
    } catch (e) {
      this.log.warn(`mail failed: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
