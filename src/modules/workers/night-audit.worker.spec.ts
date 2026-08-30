import { NightAuditWorker } from './workers.module';

describe('NightAuditWorker.autoNoShow', () => {
  it('marks CONFIRMED bookings whose arrival has passed as NO_SHOW', async () => {
    const executed: string[] = [];
    const db = {
      execute: jest.fn(async (q: unknown) => {
        const text = renderSql(q);
        executed.push(text);
        return { rowCount: 3 };
      }),
    };
    const worker = new NightAuditWorker(db as never);
    const count = await worker.autoNoShow(new Date('2026-08-30T01:00:00Z'));
    expect(count).toBe(3);
    const sql = executed[0].toLowerCase();
    expect(sql).toContain('update reservations');
    expect(sql).toContain("status='no_show'");
    expect(sql).toContain("status='confirmed'");
    expect(sql).toContain('check_in <');
  });
});

function renderSql(node: unknown): string {
  if (node == null) return '';
  const n = node as { queryChunks?: unknown[]; value?: unknown[] };
  if (Array.isArray(n.queryChunks)) return n.queryChunks.map(renderSql).join('');
  if (Array.isArray(n.value)) return n.value.map(renderSql).join('');
  if (typeof node === 'string') return node;
  return '';
}
