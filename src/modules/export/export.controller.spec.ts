import { ForbiddenException } from '@nestjs/common';
import { ExportController } from './export.controller';
import { EXPORT_PERMISSIONS, ExportService, exportEntities } from './export.service';

/** Collects everything written to a fake Express response. */
function fakeRes() {
  const headers: Record<string, string> = {};
  const chunks: string[] = [];
  return {
    headers,
    chunks,
    body: () => chunks.join(''),
    setHeader: (k: string, v: string) => {
      headers[k.toLowerCase()] = v;
    },
    write: (s: string) => {
      chunks.push(s);
      return true;
    },
    once: () => undefined,
    end: () => undefined,
  };
}

function controller(granted: string[], rows: Record<string, unknown>[] = []) {
  const audited: Record<string, unknown>[] = [];
  const readRows = jest.fn();
  const svc = {
    async *rows(entity: string, query: Record<string, string>) {
      readRows(entity, query);
      yield 'id,name\r\n';
      for (const r of rows) yield `${r.id},${r.name}\r\n`;
    },
  };
  const permissions = {
    getEffectivePermissions: async () => ({ permissions: granted, roles: [] }),
  };
  const audit = {
    record: async (e: Record<string, unknown>) => {
      audited.push(e);
    },
  };
  return {
    ctl: new ExportController(svc as never, permissions as never, audit as never),
    audited,
    readRows,
  };
}

const req = { admin: { id: 'adm-1' } } as never;

describe('ExportController permissions', () => {
  it('denies an entity the admin cannot read, and reads NOTHING', async () => {
    const { ctl, readRows, audited } = controller(['owner.view']);
    const res = fakeRes();
    await expect(ctl.export('payments.csv', {}, req, res as never)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(readRows).not.toHaveBeenCalled();
    expect(audited).toHaveLength(0);
    expect(res.chunks).toHaveLength(0);
  });

  it('names the missing permission in the refusal', async () => {
    const { ctl } = controller(['owner.view']);
    await expect(ctl.export('subscriptions.csv', {}, req, fakeRes() as never)).rejects.toThrow(
      /subscription\.view/,
    );
  });

  it('requires audit.export ON TOP of audit.view for the audit trail', async () => {
    const viewOnly = controller(['audit.view']);
    await expect(
      viewOnly.ctl.export('audit-logs.csv', {}, req, fakeRes() as never),
    ).rejects.toThrow(/audit\.export/);

    const both = controller(['audit.view', 'audit.export']);
    await expect(
      both.ctl.export('audit-logs.csv', {}, req, fakeRes() as never),
    ).resolves.toBeUndefined();
  });

  it('lets a wildcard super-admin export every entity', async () => {
    for (const entity of exportEntities) {
      const { ctl } = controller(['*']);
      await expect(
        ctl.export(`${entity}.csv`, {}, req, fakeRes() as never),
      ).resolves.toBeUndefined();
    }
  });

  it('refuses an unauthenticated request', async () => {
    const { ctl } = controller(['*']);
    await expect(
      ctl.export('owners.csv', {}, {} as never, fakeRes() as never),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects an unknown entity before checking anything else', async () => {
    const { ctl } = controller(['*']);
    await expect(ctl.export('secrets.csv', {}, req, fakeRes() as never)).rejects.toMatchObject({
      response: { error: 'UNKNOWN_EXPORT_ENTITY' },
    });
  });
});

describe('ExportController response', () => {
  it('streams raw CSV with a download disposition, outside the JSON envelope', async () => {
    const { ctl } = controller(['*'], [{ id: '1', name: 'Alpha' }]);
    const res = fakeRes();
    await ctl.export('owners.csv', {}, req, res as never);
    expect(res.headers['content-type']).toBe('text/csv; charset=utf-8');
    expect(res.headers['content-disposition']).toMatch(
      /^attachment; filename="owners-\d{4}-\d{2}-\d{2}\.csv"$/,
    );
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body()).toBe('id,name\r\n1,Alpha\r\n');
  });

  it('passes the current filters straight through to the list services', async () => {
    const { ctl, readRows } = controller(['*']);
    await ctl.export('owners.csv', { status: 'ACTIVE', q: 'kochi' }, req, fakeRes() as never);
    expect(readRows).toHaveBeenCalledWith('owners', { status: 'ACTIVE', q: 'kochi' });
  });

  it('accepts the entity with or without the .csv extension', async () => {
    const { ctl, readRows } = controller(['*']);
    await ctl.export('owners', {}, req, fakeRes() as never);
    expect(readRows).toHaveBeenCalledWith('owners', {});
  });

  it('audits every export, with the filters that produced it', async () => {
    const { ctl, audited } = controller(['*']);
    await ctl.export('invoices.csv', { ownerId: 'own-1' }, req, fakeRes() as never);
    expect(audited[0]).toMatchObject({
      action: 'export.csv',
      entity: 'invoices',
      after: { filters: { ownerId: 'own-1' } },
    });
  });
});

describe('EXPORT_PERMISSIONS', () => {
  it('covers every exportable entity', () => {
    for (const entity of exportEntities) {
      expect(EXPORT_PERMISSIONS[entity]?.length).toBeGreaterThan(0);
    }
  });

  it('names a dated file per entity', () => {
    expect(ExportService.filename('payments', new Date('2026-08-29T12:00:00Z'))).toBe(
      'payments-2026-08-29.csv',
    );
  });
});
