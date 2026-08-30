import { AlertsService } from './alerts.service';
import { mockDb } from '../owner-auth/testing/db.mock';

describe('AlertsService.list', () => {
  it('surfaces only the alerts whose count is non-zero', async () => {
    const db = mockDb({
      select: {
        expenses: [[{ n: 2 }]],
        purchase_orders: [[{ n: 1 }]],
        inventory_items: [[{ n: 0 }]],
        work_orders: [[{ n: 5 }]],
      },
    });
    const svc = new AlertsService(db as never);
    const alerts = await svc.list('prop-1');
    const ids = alerts.map((a) => a.id);
    expect(ids).toContain('approvals'); // 2 + 1 = 3
    expect(ids).toContain('work_orders'); // 5
    expect(ids).not.toContain('low_stock'); // 0 → hidden
    expect(alerts.find((a) => a.id === 'approvals')?.count).toBe(3);
  });

  it('returns an empty strip when the hotel is quiet', async () => {
    const db = mockDb({
      select: {
        expenses: [[{ n: 0 }]],
        purchase_orders: [[{ n: 0 }]],
        inventory_items: [[{ n: 0 }]],
        work_orders: [[{ n: 0 }]],
      },
    });
    const svc = new AlertsService(db as never);
    expect(await svc.list('prop-1')).toEqual([]);
  });
});
