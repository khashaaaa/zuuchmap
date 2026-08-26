import { Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { Transporter } from 'nodemailer';

/**
 * Outbound email, env-gated on `SMTP_HOST`.
 *
 * There was no email channel anywhere in the product. Signup is phone-based
 * and `user.email` is optional, so this is never the primary way to reach
 * someone — it is the receipt for a payment, and the last resort for a user
 * with no push device at all. Treating it as primary would be wrong: most
 * accounts have no address on file.
 *
 * Every failure here is swallowed and logged. A notification transport must
 * never be able to fail the transaction that triggered it.
 */
const logger = new Logger('Mailer');

let transporter: Transporter | null = null;
let attempted = false;

export function mailerConfigured(): boolean {
  return !!process.env.SMTP_HOST;
}

function getTransporter(): Transporter | null {
  if (!mailerConfigured()) return null;
  if (attempted) return transporter;
  attempted = true;
  try {
    transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      // 465 is implicit TLS; 587 upgrades with STARTTLS. Deriving it from the
      // port stops the two settings from being configured into disagreement.
      secure: Number(process.env.SMTP_PORT ?? 587) === 465,
      auth: process.env.SMTP_USER
        ? { user: process.env.SMTP_USER, pass: process.env.SMTP_PASSWORD }
        : undefined,
    });
    logger.log(`SMTP configured (${process.env.SMTP_HOST})`);
  } catch (err: any) {
    logger.error(`SMTP configuration failed — email disabled: ${err?.message}`);
    transporter = null;
  }
  return transporter;
}

export interface Mail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export async function sendMail(mail: Mail): Promise<boolean> {
  const t = getTransporter();
  if (!t) return false;
  try {
    await t.sendMail({
      from: process.env.SMTP_FROM || 'ZuuchMap <noreply@zuuchmap.com>',
      to: mail.to,
      subject: mail.subject,
      text: mail.text,
      html: mail.html,
    });
    return true;
  } catch (err: any) {
    logger.warn(`sendMail to ${mail.to} failed: ${err?.message}`);
    return false;
  }
}
