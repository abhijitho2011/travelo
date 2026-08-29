import { mockDb, sqlText, type MockDb } from '../owner-auth/testing/db.mock';
import { HousekeepingService, type TaskActor } from './housekeeping.service';
import type { Database } from '../../database/database.module';

const PROP = 'prop-mine';
const ROOM_ID = '22222222-2222-4222-8222-222222222222';
const TASK_ID = '33333333-3333-4333-8333-333333333333';
const ME = 'staff-me';
const OTHER = 'staff-other';

const supervisor: TaskActor = { id: ME, isSupervisor: true };
const attendant: TaskActor = { id: ME, isSupervisor: false };

function svc(db: MockDb) {
  return new HousekeepingService(db as unknown as Database);
}

const roomRow = (over: Record<string, unknown> = {}) => ({
  id: ROOM_ID,
  propertyId: PROP,
  number: '304',
  floor: '3',
  status: 'DIRTY',
  deletedAt: null,
  ...over,
});

const taskRow = (over: Record<string, unknown> = {}) => ({
  id: TASK_ID,
  propertyId: PROP,
  roomId: ROOM_ID,
  area: null,
  type: 'CHECKOUT_CLEAN',
  status: 'PENDING',
  priority: 'NORMAL',
  guestRequest: null,
  notes: null,
  assignedStaffId: null,
  dueAt: null,
  startedAt: null,
  completedAt: null,
  inspectedAt: null,
  createdBy: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...over,
});

describe('HousekeepingService — tenant isolation', () => {
  it('scopes a task lookup to the caller’s own property and excludes deleted rows', async () => {
    const db = mockDb({ select: { housekeeping_tasks: [[taskRow()]] } });
    await svc(db).requireTask(PROP, TASK_ID);
    const where = sqlText(db.wheresFor('housekeeping_tasks')[0]);
    expect(where).toContain('property_id');
    expect(where).toContain('deleted_at');
  });

  it('404s a task that belongs to no row', async () => {
    const db = mockDb({ select: { housekeeping_tasks: [[]] } });
    await expect(svc(db).requireTask(PROP, TASK_ID)).rejects.toMatchObject({
      response: { error: 'HK_TASK_NOT_FOUND' },
    });
  });
});

describe('HousekeepingService — start', () => {
  it('moves PENDING → IN_PROGRESS and sends a room task’s room to CLEANING', async () => {
    const db = mockDb({
      select: { housekeeping_tasks: [[taskRow()]], rooms: [[roomRow()]] },
      update: { housekeeping_tasks: [taskRow({ status: 'IN_PROGRESS' })] },
    });
    await svc(db).start(PROP, TASK_ID, attendant);

    expect(db.updates.find((u) => u.table === 'housekeeping_tasks')?.values).toMatchObject({
      status: 'IN_PROGRESS',
    });
    expect(db.updates.find((u) => u.table === 'rooms')?.values).toMatchObject({
      status: 'CLEANING',
    });
  });

  it('lets an attendant CLAIM an unassigned task on start', async () => {
    const db = mockDb({
      select: { housekeeping_tasks: [[taskRow({ assignedStaffId: null })]], rooms: [[roomRow()]] },
      update: { housekeeping_tasks: [taskRow({ status: 'IN_PROGRESS' })] },
    });
    await svc(db).start(PROP, TASK_ID, attendant);
    expect(db.updates.find((u) => u.table === 'housekeeping_tasks')?.values).toMatchObject({
      assignedStaffId: ME,
    });
  });

  it('refuses an attendant a task assigned to someone else', async () => {
    const db = mockDb({
      select: { housekeeping_tasks: [[taskRow({ assignedStaffId: OTHER })]] },
    });
    await expect(svc(db).start(PROP, TASK_ID, attendant)).rejects.toMatchObject({
      response: { error: 'HK_NOT_YOUR_TASK' },
    });
  });

  it('lets a supervisor start any task at the property', async () => {
    const db = mockDb({
      select: { housekeeping_tasks: [[taskRow({ assignedStaffId: OTHER })]], rooms: [[roomRow()]] },
      update: { housekeeping_tasks: [taskRow({ status: 'IN_PROGRESS' })] },
    });
    await expect(svc(db).start(PROP, TASK_ID, supervisor)).resolves.toBeDefined();
  });
});

describe('HousekeepingService — complete', () => {
  it('moves IN_PROGRESS → COMPLETED and sends the room to INSPECTED', async () => {
    const db = mockDb({
      select: {
        housekeeping_tasks: [[taskRow({ status: 'IN_PROGRESS', assignedStaffId: ME })]],
        rooms: [[roomRow()]],
      },
      update: { housekeeping_tasks: [taskRow({ status: 'COMPLETED' })] },
    });
    await svc(db).complete(PROP, TASK_ID, {}, attendant);
    expect(db.updates.find((u) => u.table === 'rooms')?.values).toMatchObject({
      status: 'INSPECTED',
    });
  });
});

describe('HousekeepingService — inspect', () => {
  it('pass ⇒ INSPECTED and room → READY, no redo task', async () => {
    const db = mockDb({
      select: { housekeeping_tasks: [[taskRow({ status: 'COMPLETED' })]], rooms: [[roomRow()]] },
      update: { housekeeping_tasks: [taskRow({ status: 'INSPECTED' })] },
    });
    const res = await svc(db).inspect(PROP, TASK_ID, { pass: true }, supervisor);
    expect(db.updates.find((u) => u.table === 'rooms')?.values).toMatchObject({ status: 'READY' });
    expect(res.redo).toBeNull();
    expect(db.inserts.find((i) => i.table === 'housekeeping_tasks')).toBeUndefined();
  });

  it('fail ⇒ REJECTED, room → DIRTY, and a fresh PENDING redo task is raised', async () => {
    const db = mockDb({
      select: { housekeeping_tasks: [[taskRow({ status: 'COMPLETED' })]], rooms: [[roomRow()]] },
      update: { housekeeping_tasks: [taskRow({ status: 'REJECTED' })] },
      insert: { housekeeping_tasks: [taskRow({ id: 'redo-1', status: 'PENDING' })] },
    });
    const res = await svc(db).inspect(
      PROP,
      TASK_ID,
      { pass: false, notes: 'bathroom missed' },
      supervisor,
    );

    expect(db.updates.find((u) => u.table === 'housekeeping_tasks')?.values).toMatchObject({
      status: 'REJECTED',
    });
    expect(db.updates.find((u) => u.table === 'rooms')?.values).toMatchObject({ status: 'DIRTY' });
    const redoInsert = db.inserts.find((i) => i.table === 'housekeeping_tasks');
    expect(redoInsert?.values).toMatchObject({ status: 'PENDING', type: 'CHECKOUT_CLEAN' });
    expect(String(redoInsert?.values?.notes)).toContain(TASK_ID);
    expect(res.redo?.id).toBe('redo-1');
  });

  it('refuses to inspect a task that is not yet COMPLETED', async () => {
    const db = mockDb({
      select: { housekeeping_tasks: [[taskRow({ status: 'IN_PROGRESS' })]] },
    });
    await expect(svc(db).inspect(PROP, TASK_ID, { pass: true }, supervisor)).rejects.toMatchObject({
      response: { error: 'HK_INVALID_TRANSITION' },
    });
  });
});

describe('HousekeepingService — create', () => {
  it('refuses a task that names neither a room nor an area', async () => {
    const db = mockDb({});
    await expect(
      svc(db).create(PROP, { type: 'CUSTOM' } as never, supervisor),
    ).rejects.toMatchObject({ response: { error: 'HK_LOCATION_REQUIRED' } });
  });

  it('refuses a task that names BOTH a room and an area', async () => {
    const db = mockDb({});
    await expect(
      svc(db).create(PROP, { type: 'CUSTOM', roomId: ROOM_ID, area: 'Lobby' } as never, supervisor),
    ).rejects.toMatchObject({ response: { error: 'HK_LOCATION_REQUIRED' } });
  });
});

describe('HousekeepingService — check-out auto-clean hook', () => {
  it('raises a CHECKOUT_CLEAN task for a room with no open task', async () => {
    const db = mockDb({
      select: { housekeeping_tasks: [[]] },
      insert: { housekeeping_tasks: [{ id: 'new-task' }] },
    });
    const id = await HousekeepingService.createCheckoutCleanForRoom(
      db as never,
      PROP,
      ROOM_ID,
      'staff-1',
    );
    expect(id).toBe('new-task');
    expect(db.inserts.find((i) => i.table === 'housekeeping_tasks')?.values).toMatchObject({
      type: 'CHECKOUT_CLEAN',
      status: 'PENDING',
      roomId: ROOM_ID,
    });
  });

  it('skips silently when the room already has an open task', async () => {
    const db = mockDb({
      select: { housekeeping_tasks: [[{ id: 'existing' }]] },
    });
    const id = await HousekeepingService.createCheckoutCleanForRoom(
      db as never,
      PROP,
      ROOM_ID,
      'staff-1',
    );
    expect(id).toBeNull();
    expect(db.inserts.find((i) => i.table === 'housekeeping_tasks')).toBeUndefined();
  });
});
