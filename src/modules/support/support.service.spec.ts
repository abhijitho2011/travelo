import { SupportService } from './support.service';
import { mockAudit, mockDb, type Row } from '../owner-auth/testing/db.mock';

const TICKET: Row = { id: 'tkt-1' };

function mockNotifications() {
  return {
    adminsWithPermission: async () => [],
    notifyQuietly: async () => undefined,
  };
}

function mockStorage() {
  const puts: Array<{ key: string; contentType: string }> = [];
  return {
    puts,
    driver: 's3' as const,
    put: async (key: string, _body: Buffer, contentType: string) => {
      puts.push({ key, contentType });
    },
    getSignedUrl: async (key: string) => `https://signed.example/${key}`,
  };
}

function file(over: Partial<{ originalname: string; mimetype: string; size: number }> = {}) {
  return {
    originalname: 'invoice.pdf',
    mimetype: 'application/pdf',
    size: 2048,
    buffer: Buffer.from('x'),
    ...over,
  };
}

function build(ticketRows: Row[] = [TICKET]) {
  const db = mockDb({
    select: { support_tickets: [ticketRows] },
    insert: {
      support_messages: [{ id: 'msg-1', ticketId: 'tkt-1' }],
      support_attachments: [
        { id: 'att-1', filename: 'invoice.pdf', mimeType: 'application/pdf', size: 2048 },
      ],
    },
    update: { support_tickets: [TICKET] },
  });
  const audit = mockAudit();
  const storage = mockStorage();
  const svc = new SupportService(
    db as never,
    audit as never,
    mockNotifications() as never,
    storage as never,
  );
  return { db, audit, storage, svc };
}

describe('SupportService.addAttachment', () => {
  it('authors a message then stores the attachment under the message key and presigns it', async () => {
    const { svc, db, storage } = build();
    const res = await svc.addAttachment('tkt-1', file() as never);

    expect(db.inserts.map((i) => i.table)).toEqual(['support_messages', 'support_attachments']);
    const msgInsert = db.inserts[0];
    expect(msgInsert.values).toMatchObject({
      authorType: 'ADMIN',
      body: 'Shared an attachment: invoice.pdf',
    });
    const attInsert = db.inserts[1];
    // The `url` column stores the object KEY, not a browsable URL.
    expect(attInsert.values!.url).toMatch(/^support\/tkt-1\/msg-1\/.+-invoice\.pdf$/);
    expect(storage.puts[0].key).toBe(attInsert.values!.url);
    expect(res).toMatchObject({ id: 'att-1', filename: 'invoice.pdf' });
    expect(res.url).toBe(`https://signed.example/${attInsert.values!.url}`);
  });

  it('rejects a non-image/pdf file', async () => {
    const { svc, storage } = build();
    await expect(
      svc.addAttachment('tkt-1', file({ mimetype: 'text/plain' }) as never),
    ).rejects.toMatchObject({ status: 400, response: { error: 'UNSUPPORTED_MEDIA_TYPE' } });
    expect(storage.puts).toHaveLength(0);
  });

  it('rejects an oversized file', async () => {
    const { svc } = build();
    await expect(
      svc.addAttachment('tkt-1', file({ size: 11 * 1024 * 1024 }) as never),
    ).rejects.toMatchObject({ status: 400, response: { error: 'FILE_TOO_LARGE' } });
  });

  it('404s when the ticket does not exist', async () => {
    const { svc, db } = build([]);
    await expect(svc.addAttachment('nope', file() as never)).rejects.toMatchObject({ status: 404 });
    expect(db.inserts).toHaveLength(0);
  });
});
