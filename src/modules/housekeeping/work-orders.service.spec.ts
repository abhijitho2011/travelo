import { mockDb, type MockDb } from '../owner-auth/testing/db.mock';
import { WorkOrdersService, type WorkOrderActor } from './work-orders.service';
import type { Database } from '../../database/database.module';

const PROP = 'prop-mine';
const ROOM_ID = '22222222-2222-4222-8222-222222222222';
const WO_ID = '44444444-4444-4444-8444-444444444444';
const ME = 'tech-me';

const tech: WorkOrderActor = { id: ME, isSupervisor: false };

function svc(db: MockDb) {
  return new WorkOrdersService(db as unknown as Database);
}

const woRow = (over: Record<string, unknown> = {}) => ({
  id: WO_ID,
  propertyId: PROP,
  roomId: ROOM_ID,
  workOrderNumber: 'WO-00001',
  title: 'AC not cooling',
  description: null,
  priority: 'NORMAL',
  status: 'OPEN',
  reportedBy: 'reporter-1',
  assignedStaffId: null,
  resolution: null,
  partsUsed: null,
  takesRoomOutOfService: false,
  cancelReason: null,
  acceptedAt: null,
  startedAt: null,
  completedAt: null,
  cancelledAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...over,
});

describe('WorkOrdersService — tenant isolation', () => {
  it('404s a work order that belongs to no row', async () => {
    const db = mockDb({ select: { work_orders: [[]] } });
    await expect(svc(db).requireWorkOrder(PROP, WO_ID)).rejects.toMatchObject({
      response: { error: 'WORK_ORDER_NOT_FOUND' },
    });
  });
});

describe('WorkOrdersService — accept', () => {
  it('assigns to the caller when unassigned and moves OPEN → ACCEPTED', async () => {
    const db = mockDb({
      select: { work_orders: [[woRow()]], rooms: [[]] },
      update: { work_orders: [woRow({ status: 'ACCEPTED', assignedStaffId: ME })] },
    });
    await svc(db).accept(PROP, WO_ID, tech);
    expect(db.updates.find((u) => u.table === 'work_orders')?.values).toMatchObject({
      status: 'ACCEPTED',
      assignedStaffId: ME,
    });
  });

  it('takes the room off the board (MAINTENANCE) when the order says so', async () => {
    const db = mockDb({
      select: { work_orders: [[woRow({ takesRoomOutOfService: true })]], rooms: [[]] },
      update: { work_orders: [woRow({ status: 'ACCEPTED' })] },
    });
    await svc(db).accept(PROP, WO_ID, tech);
    expect(db.updates.find((u) => u.table === 'rooms')?.values).toMatchObject({
      status: 'MAINTENANCE',
    });
  });

  it('leaves the room alone for an order that does not take it out of service', async () => {
    const db = mockDb({
      select: { work_orders: [[woRow({ takesRoomOutOfService: false })]], rooms: [[]] },
      update: { work_orders: [woRow({ status: 'ACCEPTED' })] },
    });
    await svc(db).accept(PROP, WO_ID, tech);
    expect(db.updates.find((u) => u.table === 'rooms')).toBeUndefined();
  });
});

describe('WorkOrdersService — complete', () => {
  it('requires a resolution', async () => {
    const db = mockDb({
      select: { work_orders: [[woRow({ status: 'IN_PROGRESS' })]] },
    });
    await expect(
      svc(db).complete(PROP, WO_ID, { resolution: '   ' } as never),
    ).rejects.toMatchObject({ response: { error: 'WORK_ORDER_RESOLUTION_REQUIRED' } });
  });

  it('records the resolution and returns an out-of-service room to DIRTY', async () => {
    const db = mockDb({
      select: {
        work_orders: [[woRow({ status: 'IN_PROGRESS', takesRoomOutOfService: true })]],
        rooms: [[]],
      },
      update: { work_orders: [woRow({ status: 'COMPLETED' })] },
    });
    await svc(db).complete(PROP, WO_ID, { resolution: 'Replaced compressor' });
    expect(db.updates.find((u) => u.table === 'work_orders')?.values).toMatchObject({
      status: 'COMPLETED',
      resolution: 'Replaced compressor',
    });
    expect(db.updates.find((u) => u.table === 'rooms')?.values).toMatchObject({ status: 'DIRTY' });
  });

  it('refuses to complete a job that has not started', async () => {
    const db = mockDb({ select: { work_orders: [[woRow({ status: 'ACCEPTED' })]] } });
    await expect(svc(db).complete(PROP, WO_ID, { resolution: 'done' })).rejects.toMatchObject({
      response: { error: 'WORK_ORDER_INVALID_TRANSITION' },
    });
  });
});

describe('WorkOrdersService — cancel', () => {
  it('requires a reason', async () => {
    const db = mockDb({ select: { work_orders: [[woRow({ status: 'OPEN' })]] } });
    await expect(svc(db).cancel(PROP, WO_ID, { reason: '' } as never)).rejects.toMatchObject({
      response: { error: 'WORK_ORDER_CANCEL_REASON_REQUIRED' },
    });
  });

  it('returns a room that had been taken out of service back to DIRTY', async () => {
    const db = mockDb({
      select: {
        work_orders: [[woRow({ status: 'ACCEPTED', takesRoomOutOfService: true })]],
        rooms: [[]],
      },
      update: { work_orders: [woRow({ status: 'CANCELLED' })] },
    });
    await svc(db).cancel(PROP, WO_ID, { reason: 'duplicate report' });
    expect(db.updates.find((u) => u.table === 'rooms')?.values).toMatchObject({ status: 'DIRTY' });
  });

  it('does not touch the room when cancelling an order still OPEN', async () => {
    const db = mockDb({
      select: {
        work_orders: [[woRow({ status: 'OPEN', takesRoomOutOfService: true })]],
        rooms: [[]],
      },
      update: { work_orders: [woRow({ status: 'CANCELLED' })] },
    });
    await svc(db).cancel(PROP, WO_ID, { reason: 'not needed' });
    expect(db.updates.find((u) => u.table === 'rooms')).toBeUndefined();
  });
});
