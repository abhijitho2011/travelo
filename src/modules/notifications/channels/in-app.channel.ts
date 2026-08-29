import { Database } from '../../../database/database.module';
import { notifications } from '../../../database/schema';
import {
  parseInAppRecipient,
  type NotificationChannel,
  type RenderedMessage,
} from './channel.interface';

/**
 * IN_APP delivery: a row in the existing `notifications` inbox.
 *
 * The recipient string carries the audience (`admin:` / `owner:` / `staff:`),
 * which selects which of the three nullable recipient columns is filled.
 */
export class InAppNotificationChannel implements NotificationChannel {
  readonly channel = 'IN_APP' as const;

  constructor(private readonly db: Database) {}

  async send(to: string, rendered: RenderedMessage): Promise<void> {
    const target = parseInAppRecipient(to);
    if (!target) {
      throw new Error(`Malformed IN_APP recipient "${to}" (expected admin|owner|staff:<uuid>)`);
    }
    await this.db.insert(notifications).values({
      adminId: target.audience === 'admin' ? target.id : null,
      ownerId: target.audience === 'owner' ? target.id : null,
      staffId: target.audience === 'staff' ? target.id : null,
      type: rendered.notificationKey ?? 'notification',
      title: rendered.subject ?? 'Tavelo',
      body: rendered.body,
      tone: 'info',
      meta: (rendered.relatedType
        ? { relatedType: rendered.relatedType, relatedId: rendered.relatedId ?? null }
        : null) as never,
    });
  }
}
