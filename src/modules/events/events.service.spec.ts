import { mockDb } from '../owner-auth/testing/db.mock';
import { EventsService } from './events.service';
import type { Database } from '../../database/database.module';

const MY = 'prop-mine';
const svc = (db: ReturnType<typeof mockDb>) => new EventsService(db as unknown as Database);

const eventRow = (over: Record<string, unknown> = {}) => ({
  id: 'evt-1',
  propertyId: MY,
  name: 'Sharma Wedding',
  clientName: 'Mr Sharma',
  type: 'Wedding',
  venue: 'Grand Ballroom',
  startAt: new Date('2026-09-10T18:00:00Z'),
  endAt: null,
  guestCount: 300,
  package: 'Gold',
  status: 'ENQUIRY',
  revenuePaise: 50_000_000,
  roomBlock: 20,
  notes: null,
  cancelledAt: null,
  completedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

const taskRow = (over: Record<string, unknown> = {}) => ({
  id: 'task-1',
  propertyId: MY,
  eventId: 'evt-1',
  title: 'Book florist',
  assigneeStaffId: null,
  dueAt: null,
  done: false,
  doneAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe('EventsService', () => {
  it('404s an event from another property', async () => {
    const db = mockDb({ select: { events: [[]] } });
    await expect(svc(db).require(MY, 'evt-x')).rejects.toMatchObject({
      response: { error: 'EVENT_NOT_FOUND' },
    });
  });

  describe('setStatus', () => {
    it('confirms an enquiry', async () => {
      const db = mockDb({
        select: { events: [[eventRow({ status: 'ENQUIRY' })]] },
        update: { events: [eventRow({ status: 'CONFIRMED' })] },
      });
      const { after } = await svc(db).setStatus(MY, 'evt-1', 'CONFIRMED');
      expect(after.status).toBe('CONFIRMED');
    });

    it('rejects an illegal jump ENQUIRY → COMPLETED', async () => {
      const db = mockDb({ select: { events: [[eventRow({ status: 'ENQUIRY' })]] } });
      await expect(svc(db).setStatus(MY, 'evt-1', 'COMPLETED')).rejects.toMatchObject({
        response: { error: 'INVALID_EVENT_TRANSITION' },
      });
    });

    it('stamps completedAt on completion', async () => {
      const db = mockDb({
        select: { events: [[eventRow({ status: 'IN_PROGRESS' })]] },
        update: { events: [eventRow({ status: 'COMPLETED' })] },
      });
      await svc(db).setStatus(MY, 'evt-1', 'COMPLETED');
      const upd = db.updates.find((u) => u.table === 'events')?.values;
      expect(upd?.completedAt).toBeInstanceOf(Date);
    });
  });

  describe('tasks', () => {
    it('adds a task to an event, validating the assignee is on this property', async () => {
      const db = mockDb({
        select: { events: [[eventRow()]], hotel_staff: [[{ id: 'staff-2' }]] },
        insert: { event_tasks: [taskRow({ assigneeStaffId: 'staff-2' })] },
      });
      const row = await svc(db).addTask(MY, 'evt-1', {
        title: 'Book florist',
        assigneeStaffId: 'staff-2',
      });
      expect(row.title).toBe('Book florist');
    });

    it('404s adding a task with an assignee from another property', async () => {
      const db = mockDb({ select: { events: [[eventRow()]], hotel_staff: [[]] } });
      await expect(
        svc(db).addTask(MY, 'evt-1', { title: 'x', assigneeStaffId: 'stranger' }),
      ).rejects.toMatchObject({ response: { error: 'EVENT_ASSIGNEE_NOT_FOUND' } });
    });

    it('stamps doneAt when a task is first marked done', async () => {
      const db = mockDb({
        select: { event_tasks: [[taskRow({ done: false })]] },
        update: { event_tasks: [taskRow({ done: true })] },
      });
      await svc(db).updateTask(MY, 'task-1', { done: true });
      const upd = db.updates.find((u) => u.table === 'event_tasks')?.values;
      expect(upd?.done).toBe(true);
      expect(upd?.doneAt).toBeInstanceOf(Date);
    });

    it('clears doneAt when a task is un-done', async () => {
      const db = mockDb({
        select: { event_tasks: [[taskRow({ done: true, doneAt: new Date() })]] },
        update: { event_tasks: [taskRow({ done: false })] },
      });
      await svc(db).updateTask(MY, 'task-1', { done: false });
      const upd = db.updates.find((u) => u.table === 'event_tasks')?.values;
      expect(upd?.doneAt).toBeNull();
    });
  });
});
