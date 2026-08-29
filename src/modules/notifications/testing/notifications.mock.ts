import type { NotifyRequest } from '../notification-delivery.service';

export interface MockNotifications {
  sent: NotifyRequest[];
  notify(req: NotifyRequest): Promise<void>;
  notifyQuietly(req: NotifyRequest): Promise<void>;
  notifyOnceQuietly(req: NotifyRequest): Promise<void>;
  adminsWithPermission(key: string): Promise<Array<{ id: string; name: string; email: string }>>;
  /** Every request enqueued under one template key. */
  for(key: string): NotifyRequest[];
}

/**
 * A `NotificationDeliveryService` stand-in that records instead of sending.
 *
 * `admins` seeds what `adminsWithPermission` returns, so a caller that fans a
 * notification out to the support desk can be tested without RBAC tables.
 */
export function mockNotifications(
  admins: Array<{ id: string; name: string; email: string }> = [],
): MockNotifications {
  const sent: NotifyRequest[] = [];
  return {
    sent,
    async notify(req) {
      sent.push(req);
    },
    async notifyQuietly(req) {
      sent.push(req);
    },
    async notifyOnceQuietly(req) {
      sent.push(req);
    },
    async adminsWithPermission() {
      return admins;
    },
    for(key) {
      return sent.filter((r) => r.key === key);
    },
  };
}
