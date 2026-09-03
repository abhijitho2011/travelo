import { HoldExpiryWorker } from './workers.module';

describe('HoldExpiryWorker', () => {
  it('cancels every PENDING hold whose deadline has passed, in one statement', async () => {
    const execute = jest.fn(async () => ({ rowCount: 3 }));
    const worker = new HoldExpiryWorker({ execute } as never);
    const res = await worker.run(new Date('2026-09-01T10:00:00Z'));
    expect(res).toEqual({ expired: 3 });
    expect(execute).toHaveBeenCalledTimes(1);
    const sqlText = JSON.stringify(execute.mock.calls[0]);
    expect(sqlText).toContain("status='PENDING'");
    expect(sqlText).toContain('hold_expires_at');
  });

  it('reports zero quietly when nothing has lapsed', async () => {
    const worker = new HoldExpiryWorker({ execute: async () => ({ rowCount: 0 }) } as never);
    await expect(worker.run()).resolves.toEqual({ expired: 0 });
  });
});
