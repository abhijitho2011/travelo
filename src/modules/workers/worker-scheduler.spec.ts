import { WorkerSchedulerService } from './workers.module';

/**
 * Every worker class was unit-tested and none of them ever ran: there was no
 * scheduler in the app at all, so subscriptions never expired and queued
 * notifications were never delivered. These tests pin the two properties that
 * made that failure invisible — that something calls `run()`, and that a
 * throwing or slow worker cannot stop the others.
 */
describe('WorkerSchedulerService', () => {
  const worker = (impl: () => Promise<unknown> = async () => undefined) => ({
    run: jest.fn(impl),
  });

  const build = (over: Partial<Record<string, { run: jest.Mock }>> = {}) => {
    const lifecycle = over.lifecycle ?? worker();
    const metrics = over.metrics ?? worker();
    const announcements = over.announcements ?? worker();
    const notifications = over.notifications ?? worker();
    const channex = over.channex ?? worker();
    const billing = over.billing ?? { retryPendingRefunds: jest.fn(async () => ({ retried: 0, processed: 0 })) };
    const nightAudit = over.nightAudit ?? { run: jest.fn(async () => ({ ok: true, noShows: 0, snapshots: 0 })) };
    const retention = over.retention ?? { run: jest.fn(async () => ({ audit: 0, deliveries: 0 })) };
    const svc = new WorkerSchedulerService(
      lifecycle as never,
      metrics as never,
      announcements as never,
      notifications as never,
      channex as never,
      billing as never,
      nightAudit as never,
      retention as never,
    );
    return { svc, lifecycle, metrics, announcements, notifications, channex, billing, nightAudit, retention };
  };

  it('runs each worker on its tick', async () => {
    const t = build();
    await t.svc.dispatchNotifications();
    await t.svc.publishAnnouncements();
    await t.svc.syncChannex();
    await t.svc.advanceSubscriptions();
    await t.svc.aggregateDailyMetrics();

    expect(t.notifications.run).toHaveBeenCalledTimes(1);
    expect(t.announcements.run).toHaveBeenCalledTimes(1);
    expect(t.channex.run).toHaveBeenCalledTimes(1);
    expect(t.lifecycle.run).toHaveBeenCalledTimes(1);
    expect(t.metrics.run).toHaveBeenCalledTimes(1);
  });

  it('does not start a second run while the first is still going', async () => {
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const notifications = worker(() => gate);
    const t = build({ notifications });

    const first = t.svc.dispatchNotifications();
    await t.svc.dispatchNotifications(); // overlapping tick — must be skipped
    expect(notifications.run).toHaveBeenCalledTimes(1);

    release();
    await first;

    // Once the first finishes the lock is released and the next tick runs.
    await t.svc.dispatchNotifications();
    expect(notifications.run).toHaveBeenCalledTimes(2);
  });

  it('swallows a throwing worker so the timer survives', async () => {
    const notifications = worker(async () => {
      throw new Error('provider exploded');
    });
    const t = build({ notifications });

    await expect(t.svc.dispatchNotifications()).resolves.toBeUndefined();

    // …and the failure did not leave the lock held.
    await t.svc.dispatchNotifications();
    expect(notifications.run).toHaveBeenCalledTimes(2);
  });
});
