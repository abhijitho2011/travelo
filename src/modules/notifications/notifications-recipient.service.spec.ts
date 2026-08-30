import { NotificationsService } from './notifications.service';
import { mockDb, sqlText } from '../owner-auth/testing/db.mock';

const audit = { record: jest.fn(async () => undefined) } as never;

describe('NotificationsService — owner/staff inbox scoping', () => {
  it('scopes an owner list to notifications.owner_id, never staff_id or admin_id', async () => {
    const db = mockDb({ select: { notifications: [[], [{ unread: 0 }]] } });
    const svc = new NotificationsService(db as never, audit);
    await svc.listForRecipient('owner', 'owner-1', {});
    const where = db.wheresFor('notifications').map(sqlText).join(' | ');
    expect(where).toContain('owner_id');
    expect(where).toContain('owner-1');
    expect(where).not.toContain('staff_id');
    expect(where).not.toContain('admin_id');
  });

  it('scopes a staff list to notifications.staff_id', async () => {
    const db = mockDb({ select: { notifications: [[], [{ unread: 0 }]] } });
    const svc = new NotificationsService(db as never, audit);
    await svc.listForRecipient('staff', 'staff-9', {});
    const where = db.wheresFor('notifications').map(sqlText).join(' | ');
    expect(where).toContain('staff_id');
    expect(where).toContain('staff-9');
    expect(where).not.toContain('owner_id');
  });

  it('markReadForRecipient throws NotFound when the row is not the recipient\'s', async () => {
    const db = mockDb({ select: { notifications: [[]] } }); // lookup returns nothing
    const svc = new NotificationsService(db as never, audit);
    await expect(svc.markReadForRecipient('owner', 'owner-1', 'notif-x')).rejects.toThrow(
      /not found/i,
    );
  });

  it('markReadForRecipient scopes the ownership check to the recipient column', async () => {
    const db = mockDb({ select: { notifications: [[{ id: 'notif-1' }]] } });
    const svc = new NotificationsService(db as never, audit);
    await svc.markReadForRecipient('staff', 'staff-9', 'notif-1');
    const where = db.wheresFor('notifications').map(sqlText).join(' | ');
    expect(where).toContain('staff_id');
    expect(where).toContain('staff-9');
  });
});
