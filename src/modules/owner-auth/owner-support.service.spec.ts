import { OwnerSupportService } from './owner-support.service';
import { mockAudit, mockDb, sqlText, type Row } from './testing/db.mock';

/** A StorageService stand-in: records puts and hands back a predictable URL. */
function mockStorage() {
  const puts: Array<{ key: string; contentType: string; size: number }> = [];
  return {
    puts,
    driver: 's3' as const,
    put: async (key: string, body: Buffer, contentType: string) => {
      puts.push({ key, contentType, size: body.length });
    },
    getSignedUrl: async (key: string) => `https://signed.example/${key}`,
  };
}

const TICKET: Row = {
  id: 'tkt-1',
  ownerId: 'own-1',
  propertyId: 'prop-1',
  subject: 'Room inventory not syncing',
  category: null,
  priority: 'HIGH',
  status: 'IN_PROGRESS',
  firstResponseAt: null,
  resolvedAt: null,
  createdAt: new Date('2026-08-20T09:00:00Z'),
  updatedAt: new Date('2026-08-21T09:00:00Z'),
};

function msg(over: Row = {}): Row {
  return {
    id: 'msg-1',
    ticketId: 'tkt-1',
    authorType: 'OWNER',
    authorId: 'own-1',
    body: 'The room counts are stale.',
    isInternalNote: false,
    createdAt: new Date('2026-08-20T09:00:00Z'),
    ...over,
  };
}

/** `list()` selects a joined shape; `get()` selects the bare row. */
const LIST_ROWS: Row[][] = [[{ t: TICKET, propertyName: 'Sea Breeze Resort' }], [{ count: 1 }]];

function svcWith(
  over: { tickets?: Row[][]; messages?: Row[]; properties?: Row[]; count?: number } = {},
) {
  const db = mockDb({
    select: {
      support_tickets: over.tickets ?? [[TICKET], [{ count: over.count ?? 1 }]],
      support_messages: [over.messages ?? [msg()]],
      properties: [over.properties ?? [{ id: 'prop-1' }]],
    },
    insert: {
      support_tickets: [TICKET],
      support_messages: [msg()],
    },
  });
  const audit = mockAudit();
  const storage = mockStorage();
  return {
    db,
    audit,
    storage,
    svc: new OwnerSupportService(db as never, audit as never, storage as never),
  };
}

/**
 * The single most important rule on this surface: `support_messages` rows
 * flagged `is_internal_note` are the agents' private working notes. They share a
 * table with the customer-visible thread, so the owner-side read MUST filter
 * them out — there is no second line of defence.
 */
describe('OwnerSupportService.get — internal notes never reach the owner', () => {
  it('constrains the message query on is_internal_note = false', async () => {
    const { svc, db } = svcWith();
    await svc.get('own-1', 'tkt-1');
    const where = db.wheresFor('support_messages').map(sqlText).join(' ');
    expect(where).toContain('is_internal_note');
    // The bound parameter is literally `false`, not merely mentioned.
    expect(where).toMatch(/is_internal_note\s*=\s*false/);
  });

  it('never exposes the internal-note flag or the agent id on a message', async () => {
    const { svc } = svcWith({
      messages: [msg(), msg({ id: 'msg-2', authorType: 'ADMIN', authorId: 'admin-9' })],
    });
    const res = await svc.get('own-1', 'tkt-1');
    for (const m of res.messages) {
      expect(m).not.toHaveProperty('isInternalNote');
      expect(m).not.toHaveProperty('authorId');
      expect(m).not.toHaveProperty('authorType');
    }
    expect(res.messages.map((m) => m.authorLabel)).toEqual(['You', 'Tavelo Support']);
    expect(res.messages.map((m) => m.mine)).toEqual([true, false]);
  });

  it('writes owner replies with is_internal_note explicitly false', async () => {
    const { svc, db } = svcWith();
    await svc.addMessage('own-1', 'tkt-1', 'Any update?');
    expect(db.inserts[0].values).toMatchObject({
      authorType: 'OWNER',
      authorId: 'own-1',
      isInternalNote: false,
    });
  });
});

describe('OwnerSupportService — tenant scoping', () => {
  it('404s on a ticket that belongs to another owner', async () => {
    const { svc } = svcWith({ tickets: [[]] });
    await expect(svc.get('own-1', 'someone-elses-ticket')).rejects.toMatchObject({
      status: 404,
      response: { error: 'TICKET_NOT_FOUND' },
    });
  });

  it('404s rather than appending a reply to another owner’s ticket', async () => {
    const { svc, db } = svcWith({ tickets: [[]] });
    await expect(svc.addMessage('own-1', 'someone-elses-ticket', 'hello')).rejects.toMatchObject({
      status: 404,
    });
    expect(db.inserts).toHaveLength(0);
  });

  it('filters the ticket list by owner_id', async () => {
    const { svc, db } = svcWith({ tickets: LIST_ROWS });
    await svc.list('own-1', {});
    for (const where of db.wheresFor('support_tickets')) {
      expect(sqlText(where)).toContain('owner_id');
    }
  });

  it('refuses to file a ticket against a hotel this owner does not hold', async () => {
    const { svc, db } = svcWith({ properties: [] });
    await expect(
      svc.create('own-1', {
        subject: 'Help',
        message: 'Something is wrong',
        propertyId: 'not-mine',
      }),
    ).rejects.toMatchObject({ status: 404, response: { error: 'PROPERTY_NOT_FOUND' } });
    expect(db.inserts).toHaveLength(0);
  });
});

describe('OwnerSupportService.addAttachment', () => {
  function file(over: Partial<{ originalname: string; mimetype: string; size: number }> = {}) {
    return {
      originalname: 'receipt.png',
      mimetype: 'image/png',
      size: 1024,
      buffer: Buffer.from('x'.repeat(over.size ?? 1024)),
      ...over,
    };
  }

  function svc() {
    const db = mockDb({
      select: { support_tickets: [[TICKET]] },
      insert: {
        support_messages: [msg({ authorType: 'OWNER', body: 'Shared an attachment: receipt.png' })],
        support_attachments: [
          {
            id: 'att-1',
            messageId: 'msg-1',
            filename: 'receipt.png',
            mimeType: 'image/png',
            size: 1024,
          },
        ],
      },
      update: { support_tickets: [TICKET] },
    });
    const storage = mockStorage();
    return {
      db,
      storage,
      svc: new OwnerSupportService(db as never, mockAudit() as never, storage as never),
    };
  }

  it('creates a message + attachment row with the right key and returns a presigned url', async () => {
    const { svc: s, db, storage } = svc();
    const res = await s.addAttachment('own-1', 'tkt-1', file() as never);

    expect(db.inserts.map((i) => i.table)).toEqual(['support_messages', 'support_attachments']);
    const attInsert = db.inserts.find((i) => i.table === 'support_attachments')!;
    // url column carries the STORAGE KEY, not a URL.
    expect(attInsert.values!.url).toMatch(/^support\/tkt-1\/msg-1\/.+-receipt\.png$/);
    expect(storage.puts).toHaveLength(1);
    expect(storage.puts[0].key).toBe(attInsert.values!.url);
    expect(res.url).toBe(`https://signed.example/${storage.puts[0].key}`);
    expect(res).toMatchObject({
      id: 'att-1',
      filename: 'receipt.png',
      mimeType: 'image/png',
      size: 1024,
    });
  });

  it('rejects a disallowed mime type before writing anything', async () => {
    const { svc: s, db, storage } = svc();
    await expect(
      s.addAttachment('own-1', 'tkt-1', file({ mimetype: 'application/zip' }) as never),
    ).rejects.toMatchObject({ status: 400, response: { error: 'UNSUPPORTED_MEDIA_TYPE' } });
    expect(db.inserts).toHaveLength(0);
    expect(storage.puts).toHaveLength(0);
  });

  it('rejects an oversized file', async () => {
    const { svc: s } = svc();
    await expect(
      s.addAttachment('own-1', 'tkt-1', file({ size: 11 * 1024 * 1024 }) as never),
    ).rejects.toMatchObject({ status: 400, response: { error: 'FILE_TOO_LARGE' } });
  });

  it('404s rather than attaching to another owner’s ticket', async () => {
    const db = mockDb({ select: { support_tickets: [[]] } });
    const storage = mockStorage();
    const s = new OwnerSupportService(db as never, mockAudit() as never, storage as never);
    await expect(
      s.addAttachment('own-1', 'someone-elses-ticket', file() as never),
    ).rejects.toMatchObject({ status: 404 });
    expect(db.inserts).toHaveLength(0);
    expect(storage.puts).toHaveLength(0);
  });
});

describe('OwnerSupportService.list', () => {
  it('applies status and text filters', async () => {
    const { svc, db } = svcWith({ tickets: LIST_ROWS });
    await svc.list('own-1', { status: 'OPEN', q: 'inventory' });
    const where = db.wheresFor('support_tickets').map(sqlText).join(' ');
    expect(where).toContain('status');
    expect(where).toContain('subject');
  });

  it('returns paginated ticket summaries with the hotel name attached', async () => {
    const db = mockDb({
      select: {
        support_tickets: [[{ t: TICKET, propertyName: 'Sea Breeze Resort' }], [{ count: 1 }]],
      },
    });
    const svc = new OwnerSupportService(db as never, mockAudit() as never, mockStorage() as never);
    const res = await svc.list('own-1', {});
    expect(res).toMatchObject({ total: 1, limit: 50, offset: 0 });
    expect(res.items[0]).toMatchObject({
      id: 'tkt-1',
      subject: 'Room inventory not syncing',
      priority: 'HIGH',
      status: 'IN_PROGRESS',
      propertyName: 'Sea Breeze Resort',
    });
  });
});

describe('OwnerSupportService.create', () => {
  it('writes the ticket and its opening message in one transaction', async () => {
    const { svc, db } = svcWith();
    const res = await svc.create('own-1', {
      subject: '  Room inventory not syncing  ',
      message: '  The room counts are stale.  ',
      priority: 'HIGH',
    });
    expect(db.inserts.map((i) => i.table)).toEqual(['support_tickets', 'support_messages']);
    expect(db.inserts[0].values).toMatchObject({
      ownerId: 'own-1',
      subject: 'Room inventory not syncing',
      priority: 'HIGH',
      status: 'OPEN',
    });
    expect(db.inserts[1].values).toMatchObject({ body: 'The room counts are stale.' });
    expect(res.messages).toHaveLength(1);
  });

  it('defaults an unstated priority to NORMAL', async () => {
    const { svc, db } = svcWith();
    await svc.create('own-1', { subject: 'Question', message: 'How do I add a hotel?' });
    expect(db.inserts[0].values).toMatchObject({ priority: 'NORMAL' });
  });

  it('audits the new ticket against the owner as actor', async () => {
    const { svc, audit } = svcWith();
    await svc.create('own-1', { subject: 'Question', message: 'How do I add a hotel?' });
    expect(audit.entries[0]).toMatchObject({
      action: 'owner.support.ticket.created',
      actorId: 'own-1',
      actorRole: 'OWNER',
    });
  });
});
