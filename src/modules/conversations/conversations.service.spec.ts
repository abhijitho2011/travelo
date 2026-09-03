import { ConversationsService } from './conversations.service';
import { mockDb } from '../owner-auth/testing/db.mock';

describe('ConversationsService', () => {
  it('sends to the guest through the notifications pipeline and marks the message SENT', async () => {
    const thread = {
      id: 'c1',
      propertyId: 'p',
      guestPhone: '9876543210',
      guestEmail: null,
      unreadCount: 0,
    };
    const db = mockDb({
      select: { conversations: [[thread]], properties: [[{ name: 'Sea View' }]] },
      insert: { messages: [{ id: 'm1', conversationId: 'c1' }] },
      update: { conversations: [], messages: [] },
    });
    const notifications = { notifyQuietly: jest.fn(async () => undefined) };
    const realtime = { emit: jest.fn() };
    const s = new ConversationsService(db as never, notifications as never, realtime as never);
    await s.send('p', {
      conversationId: 'c1',
      channel: 'SMS',
      body: 'Your room is ready',
      sentBy: 'st',
    });
    expect(notifications.notifyQuietly).toHaveBeenCalledWith(
      expect.objectContaining({
        key: 'guest.message',
        targets: [{ channel: 'SMS', to: '9876543210' }],
      }),
    );
    expect(db.updates.find((u) => u.table === 'messages')?.values).toMatchObject({
      status: 'SENT',
    });
    expect(realtime.emit).toHaveBeenCalledWith('p', 'message.sent', expect.any(Object));
  });

  it('an inbound message lands unread on the guest’s thread and alerts the desk', async () => {
    const db = mockDb({
      select: { conversations: [[]] },
      insert: {
        conversations: [{ id: 'c9', propertyId: 'p', guestPhone: '9876543210' }],
        messages: [{ id: 'm9' }],
      },
      update: { conversations: [] },
    });
    const realtime = { emit: jest.fn() };
    const s = new ConversationsService(db as never, undefined, realtime as never);
    await s.receive('p', {
      channel: 'SMS',
      from: '9876543210',
      body: 'Can we get a late checkout?',
    });
    expect(db.inserts.find((i) => i.table === 'messages')?.values).toMatchObject({
      direction: 'IN',
      origin: 'GUEST',
      status: 'RECEIVED',
    });
    expect(realtime.emit).toHaveBeenCalledWith(
      'p',
      'message.received',
      expect.objectContaining({ conversationId: 'c9' }),
    );
  });

  it('an internal note never leaves the building', async () => {
    const thread = { id: 'c1', propertyId: 'p', guestPhone: '9876543210', guestEmail: null };
    const db = mockDb({
      select: { conversations: [[thread]] },
      insert: { messages: [{ id: 'm1' }] },
      update: { conversations: [] },
    });
    const notifications = { notifyQuietly: jest.fn(async () => undefined) };
    const s = new ConversationsService(db as never, notifications as never, undefined);
    await s.send('p', { conversationId: 'c1', channel: 'INTERNAL', body: 'VIP — upgrade if free' });
    expect(notifications.notifyQuietly).not.toHaveBeenCalled();
    expect(db.inserts.find((i) => i.table === 'messages')?.values).toMatchObject({
      channel: 'INTERNAL',
      status: 'SENT',
    });
  });
});
