import { ReportsService } from './reports.service';

describe('ReportsService.customReport — a whitelist, never raw SQL', () => {
  function svc() {
    const db = { execute: jest.fn(async () => ({ rows: [{ group: 'OTA', count: 3 }] })) };
    return { s: new ReportsService(db as never), db };
  }

  it('assembles a scoped, grouped query from names only', async () => {
    const { s, db } = svc();
    const out = await s.customReport('prop-1', {
      entity: 'reservations',
      from: '2026-09-01',
      to: '2026-09-30',
      groupBy: 'source',
      measures: ['count', 'revenuePaise'],
    });
    const text = out.query;
    expect(text).toContain("property_id = 'prop-1'");
    expect(text).toContain('group by source');
    expect(text).toContain('deleted_at is null');
    expect(out.rows[0]).toMatchObject({ group: 'OTA' });
  });

  it('refuses an unknown entity, dimension or measure', async () => {
    const { s } = svc();
    await expect(
      s.customReport('p', { entity: 'users' as never, from: '2026-09-01', to: '2026-09-30' }),
    ).rejects.toThrow(/Unknown entity/);
    await expect(
      s.customReport('p', {
        entity: 'reservations',
        from: '2026-09-01',
        to: '2026-09-30',
        groupBy: 'password',
      }),
    ).rejects.toThrow(/Cannot group/);
    await expect(
      s.customReport('p', {
        entity: 'orders',
        from: '2026-09-01',
        to: '2026-09-30',
        measures: ['drop table'],
      }),
    ).rejects.toThrow(/Unknown measure/);
  });

  it('filter values are quoted, so a quote in a value cannot break out', async () => {
    const { s, db } = svc();
    const out = await s.customReport('p', {
      entity: 'expenses',
      from: '2026-09-01',
      to: '2026-09-30',
      filters: [{ field: 'vendor', values: ["O'Brien"] }],
    });
    expect(db.execute).toHaveBeenCalledTimes(1);
    expect(out.query).toContain("in ('O''Brien')");
  });
});
