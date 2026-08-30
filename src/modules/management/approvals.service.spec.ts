import { ApprovalsService } from './approvals.service';
import { mockDb } from '../owner-auth/testing/db.mock';

const audit = { record: jest.fn(async () => undefined) } as never;
const actor = { id: 's1', email: 'gm@x.test', role: 'general_manager' };

describe('ApprovalsService.list', () => {
  it('folds DRAFT purchase orders and expenses into one queue, in rupees', async () => {
    const db = mockDb({
      select: {
        purchase_orders: [[{ id: 'po-1', poNumber: 'PO-00001', supplierName: 'Acme', totalPaise: 500000, createdAt: new Date() }]],
        expenses: [[{ id: 'ex-1', vendor: 'Diesel Co', category: 'FUEL', amountPaise: 120000, createdAt: new Date() }]],
      },
    });
    const svc = new ApprovalsService(db as never, audit);
    const items = await svc.list('prop-1');
    expect(items).toHaveLength(2);
    const po = items.find((i) => i.type === 'purchase')!;
    expect(po.title).toContain('PO-00001');
    expect(po.amount).toBe(5000); // paise → rupees
    const ex = items.find((i) => i.type === 'expense')!;
    expect(ex.title).toBe('Diesel Co');
    expect(ex.amount).toBe(1200);
  });
});

describe('ApprovalsService.decide', () => {
  it('approves a DRAFT expense to APPROVED', async () => {
    const db = mockDb({ select: { expenses: [[{ id: 'ex-1', status: 'DRAFT' }]] } });
    const svc = new ApprovalsService(db as never, audit);
    const out = await svc.decide('prop-1', 'ex-1', true, null, actor);
    expect(out).toMatchObject({ type: 'expense', approved: true });
    expect(db.updates.find((u) => u.table === 'expenses')?.values).toMatchObject({ status: 'APPROVED' });
  });

  it('rejecting an expense withdraws it (soft delete), not a status flip', async () => {
    const db = mockDb({ select: { expenses: [[{ id: 'ex-1', status: 'DRAFT' }]] } });
    const svc = new ApprovalsService(db as never, audit);
    await svc.decide('prop-1', 'ex-1', false, 'over budget', actor);
    expect(db.updates.find((u) => u.table === 'expenses')?.values).toHaveProperty('deletedAt');
  });

  it('approves a DRAFT purchase order to SENT, rejects to CANCELLED', async () => {
    const approveDb = mockDb({ select: { expenses: [[]], purchase_orders: [[{ id: 'po-1', status: 'DRAFT' }]] } });
    const svc1 = new ApprovalsService(approveDb as never, audit);
    await svc1.decide('prop-1', 'po-1', true, null, actor);
    expect(approveDb.updates.find((u) => u.table === 'purchase_orders')?.values).toMatchObject({ status: 'SENT' });

    const rejectDb = mockDb({ select: { expenses: [[]], purchase_orders: [[{ id: 'po-1', status: 'DRAFT' }]] } });
    const svc2 = new ApprovalsService(rejectDb as never, audit);
    await svc2.decide('prop-1', 'po-1', false, null, actor);
    expect(rejectDb.updates.find((u) => u.table === 'purchase_orders')?.values).toMatchObject({ status: 'CANCELLED' });
  });

  it('404s when the id matches neither', async () => {
    const db = mockDb({ select: { expenses: [[]], purchase_orders: [[]] } });
    const svc = new ApprovalsService(db as never, audit);
    await expect(svc.decide('prop-1', 'nope', true, null, actor)).rejects.toMatchObject({ status: 404 });
  });
});
