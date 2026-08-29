import { ChannexSyncWorker } from './workers.module';

/**
 * The worker owns exactly two behaviours worth protecting: it does nothing at
 * all when Channex is off, and one broken connection cannot take the others
 * down with it. The sync service itself is stubbed — no db, no network.
 */

function stub(over: Record<string, unknown> = {}) {
  return {
    configured: true,
    activeConnections: jest.fn(async () => [{ id: 'c-1' }, { id: 'c-2' }, { id: 'c-3' }]),
    syncConnection: jest.fn(async () => ({ ok: true })),
    ...over,
  };
}

describe('ChannexSyncWorker', () => {
  it('is INERT while Channex is unconfigured — it does not even list connections', async () => {
    const svc = stub({ configured: false });
    const out = await new ChannexSyncWorker(svc as never).run();

    expect(out).toEqual({ ran: false, ok: 0, failed: 0 });
    expect(svc.activeConnections).not.toHaveBeenCalled();
  });

  it('runs every HEALTHY/WARNING connection', async () => {
    const svc = stub();
    expect(await new ChannexSyncWorker(svc as never).run()).toEqual({
      ran: true,
      ok: 3,
      failed: 0,
    });
    expect(svc.syncConnection).toHaveBeenCalledTimes(3);
  });

  it('ONE THROWING CONNECTION DOES NOT ABORT THE REST', async () => {
    // A hotel with a revoked API key must not cost every other hotel its sync.
    const svc = stub({
      syncConnection: jest.fn(async (id: string) => {
        if (id === 'c-2') throw new Error('401 from Channex');
        return { ok: true };
      }),
    });
    const out = await new ChannexSyncWorker(svc as never).run();

    expect(out).toEqual({ ran: true, ok: 2, failed: 1 });
    expect(svc.syncConnection).toHaveBeenCalledTimes(3);
  });

  it('counts a run that completed with a failed leg as failed, not as ok', async () => {
    const svc = stub({
      activeConnections: jest.fn(async () => [{ id: 'c-1' }]),
      syncConnection: jest.fn(async () => ({ ok: false })),
    });
    expect(await new ChannexSyncWorker(svc as never).run()).toEqual({
      ran: true,
      ok: 0,
      failed: 1,
    });
  });

  it('polls often enough for a channel manager to trust the inventory', () => {
    expect(ChannexSyncWorker.INTERVAL_MS).toBe(15 * 60 * 1000);
  });
});
