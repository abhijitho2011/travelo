import { AuditService } from './audit.service';

describe('AuditService (append-only writes)', () => {
  it('inserts a row with actor context from AsyncLocalStorage', async () => {
    const inserted: unknown[] = [];
    // Fake drizzle db: db.insert(table).values(row) => nothing but capture.
    const fakeDb = {
      insert: () => ({
        values: async (row: unknown) => {
          inserted.push(row);
          return undefined;
        },
      }),
    } as never;
    const svc = new AuditService(fakeDb);

    await svc.record({
      action: 'admin.created',
      entity: 'admin',
      entityId: 'a-1',
      after: { email: 'x@y.z' },
    });
    expect(inserted).toHaveLength(1);
    const row = inserted[0] as Record<string, unknown>;
    expect(row.action).toBe('admin.created');
    expect(row.entity).toBe('admin');
    expect(row.entityId).toBe('a-1');
    expect(row.after).toEqual({ email: 'x@y.z' });
  });

  it('does not expose an update method (append-only)', () => {
    const svc = new AuditService({} as never);
    // The service intentionally only offers `record` and `list`.
    expect(Object.getOwnPropertyNames(Object.getPrototypeOf(svc))).toEqual(
      expect.arrayContaining(['record', 'list']),
    );
    expect((svc as unknown as { update?: unknown }).update).toBeUndefined();
    expect((svc as unknown as { delete?: unknown }).delete).toBeUndefined();
  });
});
