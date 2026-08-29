import { Logger } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import type { AppEnv } from '../../../config/env';
import type { NotificationChannel, RenderedMessage } from './channel.interface';

export interface SmtpSettings {
  host: string;
  port: number;
  secure: boolean;
  user?: string;
  password?: string;
  from: string;
}

/**
 * Reads the SMTP half of the environment.
 *
 * Every field is optional on purpose: a deployment with no mail server is a
 * working deployment that logs instead of sending. `null` here is the signal
 * to fall back to the console channel — never a boot failure.
 */
export function smtpSettingsFrom(env: Partial<AppEnv>): SmtpSettings | null {
  const host = env.SMTP_HOST?.trim();
  if (!host) return null;
  const from = env.MAIL_FROM?.trim();
  if (!from) return null;
  return {
    host,
    port: env.SMTP_PORT ?? 587,
    secure: env.SMTP_SECURE ?? false,
    user: env.SMTP_USER?.trim() || undefined,
    password: env.SMTP_PASSWORD || undefined,
    from,
  };
}

/** Wraps a plain-text-ish body in the minimum markup a mail client needs. */
export function wrapHtml(body: string): string {
  const paragraphs = body
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 14px 0">${p.replace(/\n/g, '<br/>')}</p>`)
    .join('');
  return `<div style="font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;font-size:15px;line-height:1.55;color:#1f2933">${paragraphs}</div>`;
}

/** Strips the tags the template author wrote, for the text/plain alternative. */
export function toPlainText(body: string): string {
  return body
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export class SmtpEmailChannel implements NotificationChannel {
  readonly channel = 'EMAIL' as const;
  private readonly logger = new Logger('SmtpEmailChannel');
  private transport: nodemailer.Transporter | null = null;

  constructor(
    private readonly settings: SmtpSettings,
    /** Injected in tests so no socket is opened. */
    private readonly createTransport: typeof nodemailer.createTransport = nodemailer.createTransport,
  ) {}

  private get mailer(): nodemailer.Transporter {
    if (!this.transport) {
      this.transport = this.createTransport({
        host: this.settings.host,
        port: this.settings.port,
        secure: this.settings.secure,
        auth: this.settings.user
          ? { user: this.settings.user, pass: this.settings.password ?? '' }
          : undefined,
      });
    }
    return this.transport;
  }

  async send(to: string, rendered: RenderedMessage): Promise<void> {
    await this.mailer.sendMail({
      from: this.settings.from,
      to,
      subject: rendered.subject ?? 'Tavelo',
      text: toPlainText(rendered.body),
      html: wrapHtml(rendered.body),
    });
    this.logger.debug?.(`Sent ${rendered.notificationKey ?? 'message'} to ${to}`);
  }
}
