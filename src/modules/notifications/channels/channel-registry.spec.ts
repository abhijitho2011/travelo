import { Logger } from '@nestjs/common';
import { buildChannelRegistry } from './channel-registry';
import { ConsoleChannel, UnavailableChannel, isUnavailable } from './console.channel';
import { SmtpEmailChannel, smtpSettingsFrom, toPlainText, wrapHtml } from './smtp-email.channel';
import { SmsNotificationChannel } from './sms.channel';
import { InAppNotificationChannel } from './in-app.channel';
import { inAppRecipient, parseInAppRecipient } from './channel.interface';
import { SmsTextNotConfiguredError } from '../../shared-auth/sms/sms-provider.interface';

const sms = { sendOtp: jest.fn(), sendText: jest.fn(async () => undefined) };
const db = { insert: jest.fn() } as never;

function silentLogger(): Logger {
  const log = new Logger('test');
  jest.spyOn(log, 'log').mockImplementation(() => undefined);
  jest.spyOn(log, 'warn').mockImplementation(() => undefined);
  return log;
}

describe('buildChannelRegistry — selection per env', () => {
  it('uses the real SMTP channel when SMTP_HOST and MAIL_FROM are set', () => {
    const reg = buildChannelRegistry(
      { SMTP_HOST: 'smtp.example.com', SMTP_PORT: 465, SMTP_SECURE: true, MAIL_FROM: 'a@b.test' },
      { db, sms },
      silentLogger(),
    );
    expect(reg.get('EMAIL')).toBeInstanceOf(SmtpEmailChannel);
  });

  it('falls back to the console channel when SMTP is unconfigured, and warns ONCE', () => {
    const logger = silentLogger();
    const warn = jest.spyOn(logger, 'warn');
    const reg = buildChannelRegistry({}, { db, sms }, logger);
    expect(reg.get('EMAIL')).toBeInstanceOf(ConsoleChannel);
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('falls back when MAIL_FROM is missing even though a host is set', () => {
    const reg = buildChannelRegistry(
      { SMTP_HOST: 'smtp.example.com' },
      { db, sms },
      silentLogger(),
    );
    expect(reg.get('EMAIL')).toBeInstanceOf(ConsoleChannel);
  });

  it('never throws on a completely empty environment', () => {
    expect(() => buildChannelRegistry({}, { db, sms }, silentLogger())).not.toThrow();
  });

  it('registers SMS against the shared-auth provider, not a second SMS client', () => {
    const reg = buildChannelRegistry({}, { db, sms }, silentLogger());
    expect(reg.get('SMS')).toBeInstanceOf(SmsNotificationChannel);
  });

  it('registers IN_APP against the database', () => {
    const reg = buildChannelRegistry({}, { db, sms }, silentLogger());
    expect(reg.get('IN_APP')).toBeInstanceOf(InAppNotificationChannel);
  });

  it('leaves WHATSAPP and PUSH explicitly unavailable — never faked', () => {
    const reg = buildChannelRegistry({}, { db, sms }, silentLogger());
    for (const name of ['WHATSAPP', 'PUSH'] as const) {
      const ch = reg.get(name);
      expect(ch).toBeInstanceOf(UnavailableChannel);
      expect(isUnavailable(ch!)).toBe(true);
    }
  });

  it('does not mark the real channels unavailable', () => {
    const reg = buildChannelRegistry({}, { db, sms }, silentLogger());
    for (const name of ['EMAIL', 'SMS', 'IN_APP'] as const) {
      expect(isUnavailable(reg.get(name)!)).toBe(false);
    }
  });
});

describe('smtpSettingsFrom', () => {
  it('defaults the port to 587 and secure to false', () => {
    const s = smtpSettingsFrom({ SMTP_HOST: 'h', MAIL_FROM: 'f@x.test' })!;
    expect(s.port).toBe(587);
    expect(s.secure).toBe(false);
  });

  it('drops a blank SMTP_USER rather than sending empty credentials', () => {
    const s = smtpSettingsFrom({ SMTP_HOST: 'h', MAIL_FROM: 'f@x.test', SMTP_USER: '   ' })!;
    expect(s.user).toBeUndefined();
  });
});

describe('email body shaping', () => {
  it('splits blank-line-separated text into paragraphs', () => {
    expect(wrapHtml('one\n\ntwo').match(/<p /g)).toHaveLength(2);
  });

  it('round-trips escaped entities back to text for the plain alternative', () => {
    expect(toPlainText('Ben &amp; Co<br/>next')).toBe('Ben & Co\nnext');
  });
});

describe('SmtpEmailChannel', () => {
  it('sends both a text and an html alternative from the configured address', async () => {
    const sendMail = jest.fn(async (_opts: Record<string, unknown>) => undefined);
    const channel = new SmtpEmailChannel(
      { host: 'h', port: 587, secure: false, from: 'Tavelo <no-reply@tavelo.app>' },
      (() => ({ sendMail })) as never,
    );
    await channel.send('owner@x.test', { subject: 'Hi', body: 'Hello <b>there</b>' });
    const arg = sendMail.mock.calls[0][0] as Record<string, string>;
    expect(arg.from).toBe('Tavelo <no-reply@tavelo.app>');
    expect(arg.to).toBe('owner@x.test');
    expect(arg.text).toBe('Hello there');
    expect(arg.html).toContain('Hello <b>there</b>');
  });

  it('propagates a transport failure so the dispatcher can retry it', async () => {
    const channel = new SmtpEmailChannel(
      { host: 'h', port: 587, secure: false, from: 'f@x.test' },
      (() => ({
        sendMail: async () => {
          throw new Error('ECONNREFUSED');
        },
      })) as never,
    );
    await expect(channel.send('a@b.test', { body: 'x' })).rejects.toThrow('ECONNREFUSED');
  });
});

describe('SmsNotificationChannel', () => {
  it('delegates the body to the shared SmsProvider', async () => {
    const provider = { sendOtp: jest.fn(), sendText: jest.fn(async () => undefined) };
    await new SmsNotificationChannel(provider).send('9000000001', { body: 'short copy' });
    expect(provider.sendText).toHaveBeenCalledWith('9000000001', 'short copy');
    expect(provider.sendOtp).not.toHaveBeenCalled();
  });

  it('rethrows SmsTextNotConfiguredError so it can be recorded as SKIPPED', async () => {
    const provider = {
      sendOtp: jest.fn(),
      sendText: async () => {
        throw new SmsTextNotConfiguredError();
      },
    };
    await expect(
      new SmsNotificationChannel(provider).send('900', { body: 'x' }),
    ).rejects.toBeInstanceOf(SmsTextNotConfiguredError);
  });
});

describe('IN_APP recipients', () => {
  it('round-trips every audience', () => {
    for (const audience of ['admin', 'owner', 'staff'] as const) {
      expect(parseInAppRecipient(inAppRecipient(audience, 'id-1'))).toEqual({
        audience,
        id: 'id-1',
      });
    }
  });

  it('rejects a malformed or unknown-audience recipient', () => {
    for (const bad of ['', 'nope', 'ghost:1', ':id', 'admin:']) {
      expect(parseInAppRecipient(bad)).toBeNull();
    }
  });

  it('writes to the column matching the audience and leaves the others null', async () => {
    const values = jest.fn(async (_row: Record<string, unknown>) => undefined);
    const channel = new InAppNotificationChannel({ insert: () => ({ values }) } as never);
    await channel.send(inAppRecipient('owner', 'own-1'), {
      subject: 'Title',
      body: 'Body',
      notificationKey: 'payment.success',
    });
    const row = values.mock.calls[0][0];
    expect(row).toMatchObject({ ownerId: 'own-1', adminId: null, staffId: null, title: 'Title' });
  });

  it('throws on a malformed recipient rather than writing a headless row', async () => {
    const channel = new InAppNotificationChannel({
      insert: () => ({ values: jest.fn() }),
    } as never);
    await expect(channel.send('garbage', { body: 'x' })).rejects.toThrow(/Malformed IN_APP/);
  });
});
