import { SubscriptionLifecycleWorker } from './workers.module';

/**
 * Renders a drizzle SQL tag to a lowercased string so a test can assert on the
 * statement a worker actually built.
 */
function sqlToText(node: unknown): string {
  if (node == null) return '';
  const n = node as { queryChunks?: unknown[]; value?: unknown[] };
  if (Array.isArray(n.queryChunks)) return n.queryChunks.map(sqlToText).join('');
  if (Array.isArray(n.value)) return n.value.map(sqlToText).join('');
  if (typeof node === 'string') return node;
  return '';
}

describe('SubscriptionLifecycleWorker — trials (item 2.4)', () => {
  it('expires lapsed trials and notifies them, and only ever-paid subs get grace', async () => {
    const executed: string[] = [];
    const trialRow = {
      subscription_id: 'sub-trial',
      owner_id: 'own-1',
      owner_name: 'Asha',
      owner_email: 'asha@example.com',
      plan_name: 'Growth',
      property_name: 'Backwater Retreat',
      period_end: '2026-08-01T00:00:00Z',
    };
    const db = {
      execute: jest.fn(async (q: unknown) => {
        const text = sqlToText(q).toLowerCase();
        executed.push(text);
        // The FIRST call is the expiredTrials audience SELECT — hand back one
        // lapsed trial. Every other SELECT/UPDATE returns nothing.
        if (text.includes('select') && text.includes("s.status='trial'")) {
          return { rows: [trialRow] };
        }
        return { rows: [] };
      }),
    };
    const notes: { key: string; relatedId: string }[] = [];
    const notifications = {
      notifyOnceQuietly: jest.fn(async (r: { key: string; relatedId: string }) => {
        notes.push({ key: r.key, relatedId: r.relatedId });
      }),
    };
    const worker = new SubscriptionLifecycleWorker(db as never, notifications as never);
    const out = await worker.run(new Date('2026-08-30T00:00:00Z'));
    expect(out).toEqual({ ok: true });

    // A TRIAL -> EXPIRED update was issued.
    const trialExpire = executed.find(
      (t) => t.includes('update subscriptions') && t.includes("status='trial'"),
    );
    expect(trialExpire).toBeTruthy();
    expect(trialExpire).toContain("set status='expired'");

    // The grace transition is gated on an existing successful payment.
    const grace = executed.find((t) => t.includes("set status='grace_period'"));
    expect(grace).toContain('exists');
    expect(grace).toContain('pay.status');

    // The lapsed trial was told its trial ended.
    expect(notes.some((n) => n.key === 'subscription.trial_expired' && n.relatedId === 'sub-trial'))
      .toBe(true);
  });
});
