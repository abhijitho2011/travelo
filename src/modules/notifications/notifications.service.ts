import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { notifications, notificationTemplates } from '../../database/schema';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class NotificationsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async listForAdmin(
    adminId: string,
    params: { limit?: number; offset?: number; unread?: boolean },
  ) {
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;
    const where = params.unread
      ? and(eq(notifications.adminId, adminId), isNull(notifications.readAt))
      : eq(notifications.adminId, adminId);
    const rows = await this.db
      .select()
      .from(notifications)
      .where(where)
      .orderBy(desc(notifications.createdAt))
      .limit(limit)
      .offset(offset);
    const [{ unread }] = await this.db
      .select({ unread: sql<number>`count(*)::int` })
      .from(notifications)
      .where(and(eq(notifications.adminId, adminId), isNull(notifications.readAt)));
    return { items: rows, unread, limit, offset };
  }

  async markRead(adminId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(notifications)
      .where(and(eq(notifications.id, id), eq(notifications.adminId, adminId)))
      .limit(1);
    if (!row) throw new NotFoundException('Notification not found');
    await this.db.update(notifications).set({ readAt: new Date() }).where(eq(notifications.id, id));
    return { read: true };
  }

  async markAllRead(adminId: string) {
    await this.db
      .update(notifications)
      .set({ readAt: new Date() })
      .where(and(eq(notifications.adminId, adminId), isNull(notifications.readAt)));
    return { read: true };
  }

  async createForAdmin(
    adminId: string,
    payload: {
      type: string;
      title: string;
      body?: string;
      tone?: string;
      meta?: unknown;
    },
  ) {
    const [row] = await this.db
      .insert(notifications)
      .values({
        adminId,
        type: payload.type,
        title: payload.title,
        body: payload.body,
        tone: payload.tone ?? 'info',
        meta: payload.meta as never,
      })
      .returning();
    return row;
  }

  async listTemplates() {
    return this.db.select().from(notificationTemplates).orderBy(notificationTemplates.name);
  }

  async upsertTemplate(dto: {
    templateKey: string;
    name: string;
    channel: string;
    subject?: string;
    body: string;
    status?: string;
  }) {
    const [row] = await this.db
      .insert(notificationTemplates)
      .values({
        templateKey: dto.templateKey,
        name: dto.name,
        channel: dto.channel,
        subject: dto.subject,
        body: dto.body,
        status: dto.status ?? 'Active',
      })
      .onConflictDoUpdate({
        target: notificationTemplates.templateKey,
        set: {
          name: dto.name,
          channel: dto.channel,
          subject: dto.subject,
          body: dto.body,
          status: dto.status ?? 'Active',
          updatedAt: new Date(),
        },
      })
      .returning();
    await this.audit.record({
      action: 'notification.template.upserted',
      entity: 'notification_template',
      entityId: row.id,
      after: row,
    });
    return row;
  }
}
