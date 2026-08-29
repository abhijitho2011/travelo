import { NotificationDispatchWorker } from './workers.module';
import { mockDb } from '../owner-auth/testing/db.mock';

const EMPTY = { processed: 0, sent: 0, failed: 0, skipped: 0, retried: 0 };

describe('NotificationDispatchWorker', () => {
  it('reports the drain stats and records a Completed job row', async () => {
    const db = mockDb({ insert: { background_jobs: [{ id: 'job-1' }] } });
    const deliveries = { drain: jest.fn(async () => ({ ...EMPTY, processed: 3, sent: 3 })) };
    const out = await new NotificationDispatchWorker(db as never, deliveries as never).run();
    expect(out).toMatchObject({ ok: true, processed: 3, sent: 3 });
    expect(db.inserts[0].values).toMatchObject({
      name: 'notification.dispatch',
      state: 'Completed',
    });
  });

  it('survives a drain that throws and records the failure instead of crashing', async () => {
    const db = mockDb({ insert: { background_jobs: [{ id: 'job-1' }] } });
    const deliveries = {
      drain: async () => {
        throw new Error('database gone');
      },
    };
    const out = await new NotificationDispatchWorker(db as never, deliveries as never).run();
    expect(out.ok).toBe(false);
    expect(db.inserts[0].values).toMatchObject({ state: 'Failed', error: 'database gone' });
  });

  it('does not throw even when the job-row write ALSO fails', async () => {
    const db = {
      insert: () => {
        throw new Error('no table');
      },
    };
    const deliveries = { drain: jest.fn(async () => ({ ...EMPTY })) };
    await expect(
      new NotificationDispatchWorker(db as never, deliveries as never).run(),
    ).resolves.toMatchObject({ ok: true });
  });

  it('passes the batch limit straight through to the drain', async () => {
    const db = mockDb({ insert: { background_jobs: [{ id: 'job-1' }] } });
    const deliveries = { drain: jest.fn(async () => ({ ...EMPTY })) };
    await new NotificationDispatchWorker(db as never, deliveries as never).run(7);
    expect(deliveries.drain).toHaveBeenCalledWith(7);
  });
});
