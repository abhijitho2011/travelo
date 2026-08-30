import {
  MAX_ATTEMPTS,
  NotificationDeliveryService,
  backoffMs,
} from './notification-delivery.service';
import { mockDb, MockDb } from '../owner-auth/testing/db.mock';
import type { ChannelRegistry, NotificationChannel } from './channels/channel.interface';
import { UnavailableChannel } from './channels/console.channel';
import { SmsTextNotConfiguredError } from '../shared-auth/sms/sms-provider.interface';

type Row = Record<string, unknown>;

function registryOf(entries: Array<[string, NotificationChannel]>): ChannelRegistry {
  return new Map(entries) as ChannelRegistry;
}

function okChannel(name: string, send = jest.fn(async () => undefined)) {
  return { channel: { channel: name, send } as never as NotificationChannel, send };
}

function failingChannel(name: string, err: unknown) {
  const send = jest.fn(async () => {
    throw err;
  });
  return { channel: { channel: name, send } as never as NotificationChannel, send };
}

function delivery(over: Row = {}): Row {
  return {
    id: 'del-1',
    notificationKey: 'payment.success',
    channel: 'EMAIL',
    recipient: 'owner@x.test',
    subject: 'Hi',
    body: 'Body',
    status: 'PENDING',
    attempts: 0,
    relatedType: null,
    relatedId: null,
    ...over,
  };
}

function updateFor(db: MockDb): Row {
  const rec = db.updates.find((u) => u.table === 'notification_deliveries');
  if (!rec) throw new Error('no delivery update recorded');
  return rec.values as Row;
}

// ---------- Enqueue ----------

describe('NotificationDeliveryService.notify — templates', () => {
  it('renders one PENDING row per target that has a template', async () => {
    const db = mockDb({
      select: {
        notification_templates: [
          [
            { channel: 'EMAIL', subject: 'Hello {{name}}', body: 'Hi {{name}}' },
            { channel: 'IN_APP', subject: 'Hello', body: 'Hi {{name}}' },
          ],
        ],
      },
    });
    const svc = new NotificationDeliveryService(db as never, registryOf([]));
    await svc.notify({
      key: 'payment.success',
      targets: [
        { channel: 'EMAIL', to: 'a@b.test' },
        { channel: 'IN_APP', to: 'owner:own-1' },
      ],
      vars: { name: 'Asha' },
    });
    const rows = db.inserts.filter((i) => i.table === 'notification_deliveries');
    // EMAIL + IN_APP as requested, plus a PUSH row mirrored off the owner IN_APP
    // target (reusing the IN_APP template body).
    expect(rows).toHaveLength(3);
    expect(rows.every((r) => (r.values as Row).status === 'PENDING')).toBe(true);
    expect((rows[0].values as Row).subject).toBe('Hello Asha');
    expect((rows[0].values as Row).body).toBe('Hi Asha');
    const push = rows.map((r) => r.values as Row).find((r) => r.channel === 'PUSH')!;
    expect(push.recipient).toBe('owner:own-1');
    expect(push.body).toBe('Hi Asha');
  });

  it('SKIPS a channel with no template instead of sending other copy', async () => {
    const db = mockDb({
      select: { notification_templates: [[{ channel: 'EMAIL', subject: 'S', body: 'long body' }]] },
    });
    const svc = new NotificationDeliveryService(db as never, registryOf([]));
    await svc.notify({
      key: 'payment.success',
      targets: [
        { channel: 'EMAIL', to: 'a@b.test' },
        { channel: 'SMS', to: '9000000001' },
      ],
    });
    const rows = db.inserts
      .filter((i) => i.table === 'notification_deliveries')
      .map((i) => i.values as Row);
    const smsRow = rows.find((r) => r.channel === 'SMS')!;
    expect(smsRow.status).toBe('SKIPPED');
    expect(smsRow.body).toBe('');
    expect(String(smsRow.lastError)).toContain('No active SMS template');
  });

  it('drops empty recipients before writing anything', async () => {
    const db = mockDb({ select: { notification_templates: [[]] } });
    const svc = new NotificationDeliveryService(db as never, registryOf([]));
    await svc.notify({ key: 'k', targets: [{ channel: 'EMAIL', to: '' }] });
    expect(db.inserts).toHaveLength(0);
    expect(db.selects).toHaveLength(0);
  });
});

describe('NotificationDeliveryService.notifyQuietly — the caller is never harmed', () => {
  it('swallows a database failure so the originating action survives', async () => {
    const exploding = {
      select: () => {
        throw new Error('connection reset');
      },
    };
    const svc = new NotificationDeliveryService(exploding as never, registryOf([]));
    await expect(
      svc.notifyQuietly({
        key: 'payment.success',
        targets: [{ channel: 'EMAIL', to: 'a@b.test' }],
      }),
    ).resolves.toBeUndefined();
  });

  it('notify itself DOES throw — only the quiet form swallows', async () => {
    const exploding = {
      select: () => {
        throw new Error('connection reset');
      },
    };
    const svc = new NotificationDeliveryService(exploding as never, registryOf([]));
    await expect(
      svc.notify({ key: 'k', targets: [{ channel: 'EMAIL', to: 'a@b.test' }] }),
    ).rejects.toThrow('connection reset');
  });
});

describe('NotificationDeliveryService.notifyOnceQuietly — no daily repeats', () => {
  const req = {
    key: 'subscription.expiring',
    relatedType: 'subscription.expiring.30',
    relatedId: 'sub-1',
    targets: [{ channel: 'EMAIL' as const, to: 'a@b.test' }],
  };

  it('writes nothing when the same event was already enqueued', async () => {
    const db = mockDb({ select: { notification_deliveries: [[{ id: 'existing' }]] } });
    await new NotificationDeliveryService(db as never, registryOf([])).notifyOnceQuietly(req);
    expect(db.inserts).toHaveLength(0);
  });

  it('enqueues when the event has not been seen', async () => {
    const db = mockDb({
      select: {
        notification_deliveries: [[]],
        notification_templates: [[{ channel: 'EMAIL', subject: 'S', body: 'B' }]],
      },
    });
    await new NotificationDeliveryService(db as never, registryOf([])).notifyOnceQuietly(req);
    expect(db.inserts).toHaveLength(1);
  });
});

// ---------- Drain ----------

describe('NotificationDeliveryService.drain — success', () => {
  it('marks a delivered row SENT with a timestamp and clears the error', async () => {
    const db = mockDb({ select: { notification_deliveries: [[delivery()]] } });
    const email = okChannel('EMAIL');
    const svc = new NotificationDeliveryService(
      db as never,
      registryOf([['EMAIL', email.channel]]),
    );
    const stats = await svc.drain(10, new Date('2026-08-29T10:00:00Z'));
    expect(stats).toMatchObject({ processed: 1, sent: 1, failed: 0 });
    expect(updateFor(db)).toMatchObject({
      status: 'SENT',
      attempts: 1,
      lastError: null,
      sentAt: new Date('2026-08-29T10:00:00Z'),
    });
  });

  it('hands the channel the recipient and the stored copy', async () => {
    const db = mockDb({ select: { notification_deliveries: [[delivery()]] } });
    const email = okChannel('EMAIL');
    await new NotificationDeliveryService(
      db as never,
      registryOf([['EMAIL', email.channel]]),
    ).drain();
    expect(email.send).toHaveBeenCalledWith(
      'owner@x.test',
      expect.objectContaining({ subject: 'Hi', body: 'Body', notificationKey: 'payment.success' }),
    );
  });
});

describe('NotificationDeliveryService.drain — retry policy', () => {
  it('reschedules with exponential backoff while attempts remain', async () => {
    const db = mockDb({ select: { notification_deliveries: [[delivery({ attempts: 1 })]] } });
    const email = failingChannel('EMAIL', new Error('smtp down'));
    const now = new Date('2026-08-29T10:00:00Z');
    const stats = await new NotificationDeliveryService(
      db as never,
      registryOf([['EMAIL', email.channel]]),
    ).drain(10, now);
    expect(stats).toMatchObject({ retried: 1, failed: 0, sent: 0 });
    const set = updateFor(db);
    expect(set.status).toBe('PENDING');
    expect(set.attempts).toBe(2);
    expect(set.lastError).toBe('smtp down');
    // attempts=2 -> 2 minutes
    expect((set.scheduledFor as Date).getTime() - now.getTime()).toBe(2 * 60_000);
  });

  it('marks FAILED once the attempt cap is reached, and stops rescheduling', async () => {
    const db = mockDb({
      select: { notification_deliveries: [[delivery({ attempts: MAX_ATTEMPTS - 1 })]] },
    });
    const email = failingChannel('EMAIL', new Error('smtp down'));
    const stats = await new NotificationDeliveryService(
      db as never,
      registryOf([['EMAIL', email.channel]]),
    ).drain();
    expect(stats).toMatchObject({ failed: 1, retried: 0 });
    const set = updateFor(db);
    expect(set.status).toBe('FAILED');
    expect(set.attempts).toBe(MAX_ATTEMPTS);
    expect(set.scheduledFor).toBeUndefined();
  });

  it('backs off 1, 2, 4, 8, 16 minutes and then caps', () => {
    expect([1, 2, 3, 4, 5, 9].map(backoffMs)).toEqual([
      60_000,
      120_000,
      240_000,
      480_000,
      960_000,
      32 * 60_000,
    ]);
  });
});

describe('NotificationDeliveryService.drain — a broken provider cannot stop the queue', () => {
  it('keeps processing after one channel throws', async () => {
    const db = mockDb({
      select: {
        notification_deliveries: [
          [delivery({ id: 'a', channel: 'EMAIL' }), delivery({ id: 'b', channel: 'IN_APP' })],
        ],
      },
    });
    const email = failingChannel('EMAIL', new Error('boom'));
    const inApp = okChannel('IN_APP');
    const stats = await new NotificationDeliveryService(
      db as never,
      registryOf([
        ['EMAIL', email.channel],
        ['IN_APP', inApp.channel],
      ]),
    ).drain();
    expect(inApp.send).toHaveBeenCalledTimes(1);
    expect(stats).toMatchObject({ processed: 2, sent: 1, retried: 1 });
  });

  it('never lets a provider throw escape drain()', async () => {
    const db = mockDb({ select: { notification_deliveries: [[delivery()]] } });
    const email = failingChannel('EMAIL', new Error('boom'));
    await expect(
      new NotificationDeliveryService(db as never, registryOf([['EMAIL', email.channel]])).drain(),
    ).resolves.toBeDefined();
  });
});

describe('NotificationDeliveryService.drain — permanent conditions are SKIPPED, not retried', () => {
  it('skips when the SMS provider has no notification template registered', async () => {
    const db = mockDb({
      select: { notification_deliveries: [[delivery({ channel: 'SMS', recipient: '900' })]] },
    });
    const sms = failingChannel('SMS', new SmsTextNotConfiguredError('no DLT template'));
    const stats = await new NotificationDeliveryService(
      db as never,
      registryOf([['SMS', sms.channel]]),
    ).drain();
    expect(stats).toMatchObject({ skipped: 1, retried: 0, failed: 0 });
    expect(updateFor(db).status).toBe('SKIPPED');
  });

  it('skips WHATSAPP and PUSH rather than reporting a delivery that never happened', async () => {
    for (const name of ['WHATSAPP', 'PUSH'] as const) {
      const db = mockDb({ select: { notification_deliveries: [[delivery({ channel: name })]] } });
      const channel = new UnavailableChannel(name);
      jest.spyOn(channel, 'send').mockResolvedValue(undefined);
      const stats = await new NotificationDeliveryService(
        db as never,
        registryOf([[name, channel]]),
      ).drain();
      expect(stats).toMatchObject({ skipped: 1, sent: 0 });
      expect(updateFor(db).status).toBe('SKIPPED');
    }
  });

  it('skips a channel with no registered implementation at all', async () => {
    const db = mockDb({ select: { notification_deliveries: [[delivery({ channel: 'EMAIL' })]] } });
    const stats = await new NotificationDeliveryService(db as never, registryOf([])).drain();
    expect(stats).toMatchObject({ skipped: 1 });
    expect(String(updateFor(db).lastError)).toContain('No implementation registered');
  });
});
