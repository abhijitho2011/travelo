import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { and, desc, eq, inArray, isNull } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { announcements, owners } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { getRequestContext } from '../../common/context/request-context';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service';
import { inAppRecipient } from '../notifications/channels/channel.interface';

@Injectable()
export class AnnouncementsService {
  private readonly logger = new Logger(AnnouncementsService.name);
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly notifications: NotificationDeliveryService,
  ) {}

  async list(params: { limit?: number; offset?: number; status?: string }) {
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;
    const where = params.status ? eq(announcements.status, params.status) : undefined;
    return this.db
      .select()
      .from(announcements)
      .where(where)
      .orderBy(desc(announcements.createdAt))
      .limit(limit)
      .offset(offset);
  }

  async get(id: string) {
    const [row] = await this.db
      .select()
      .from(announcements)
      .where(eq(announcements.id, id))
      .limit(1);
    if (!row) throw new NotFoundException('Announcement not found');
    return row;
  }

  async create(dto: {
    title: string;
    message: string;
    audience: unknown;
    channels?: unknown;
    priority?: string;
    scheduledAt?: Date;
    expiresAt?: Date;
    status?: string;
  }) {
    const ctx = getRequestContext();
    const [row] = await this.db
      .insert(announcements)
      .values({
        title: dto.title,
        message: dto.message,
        audience: dto.audience as never,
        channels: dto.channels as never,
        priority: dto.priority ?? 'NORMAL',
        scheduledAt: dto.scheduledAt,
        expiresAt: dto.expiresAt,
        status: dto.status ?? 'DRAFT',
        createdBy: ctx?.adminId,
      })
      .returning();
    await this.audit.record({
      action: 'announcement.created',
      entity: 'announcement',
      entityId: row.id,
      after: row,
    });
    return row;
  }

  async update(
    id: string,
    dto: Partial<{
      title: string;
      message: string;
      audience: unknown;
      channels: unknown;
      priority: string;
      scheduledAt: Date;
      expiresAt: Date;
      status: string;
    }>,
  ) {
    const before = await this.get(id);
    await this.db
      .update(announcements)
      .set({
        ...(dto.title && { title: dto.title }),
        ...(dto.message && { message: dto.message }),
        ...(dto.audience !== undefined ? { audience: dto.audience as never } : {}),
        ...(dto.channels !== undefined ? { channels: dto.channels as never } : {}),
        ...(dto.priority && { priority: dto.priority }),
        ...(dto.scheduledAt && { scheduledAt: dto.scheduledAt }),
        ...(dto.expiresAt && { expiresAt: dto.expiresAt }),
        ...(dto.status && { status: dto.status }),
        updatedAt: new Date(),
      })
      .where(eq(announcements.id, id));
    const after = await this.get(id);
    await this.audit.record({
      action: 'announcement.updated',
      entity: 'announcement',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  async publish(id: string) {
    const before = await this.get(id);
    await this.db
      .update(announcements)
      .set({ status: 'PUBLISHED', publishedAt: new Date(), updatedAt: new Date() })
      .where(eq(announcements.id, id));
    const after = await this.get(id);
    await this.audit.record({
      action: 'announcement.published',
      entity: 'announcement',
      entityId: id,
      before,
      after,
    });
    await this.announce(after);
    return after;
  }

  /**
   * In-app to the targeted owners, after the row is already PUBLISHED.
   *
   * `audience` is free-form jsonb. An explicit `ownerIds` array targets exactly
   * those owners; anything else (`{all:true}`, a segment description, null) is
   * read as "every active owner", which is the safe reading for a broadcast.
   */
  private async announce(row: { id: string; title: string; message: string; audience: unknown }) {
    try {
      const owners = await this.resolveAudience(row.audience);
      for (const owner of owners) {
        await this.notifications.notifyQuietly({
          key: 'announcement.published',
          relatedType: 'announcement',
          relatedId: row.id,
          targets: [{ channel: 'IN_APP', to: inAppRecipient('owner', owner.id) }],
          vars: { title: row.title, message: row.message, ownerName: owner.name },
        });
      }
    } catch (err) {
      this.logger.error(`announcement.published notification failed for ${row.id}`, err as Error);
    }
  }

  private async resolveAudience(audience: unknown): Promise<Array<{ id: string; name: string }>> {
    const explicit = (audience as { ownerIds?: unknown })?.ownerIds;
    const ids = Array.isArray(explicit) ? explicit.filter((v) => typeof v === 'string') : null;
    const conds = [isNull(owners.deletedAt), eq(owners.status, 'ACTIVE')];
    if (ids && ids.length) conds.push(inArray(owners.id, ids as string[]));
    else if (ids) return [];
    return this.db
      .select({ id: owners.id, name: owners.name })
      .from(owners)
      .where(and(...conds));
  }

  async remove(id: string) {
    const before = await this.get(id);
    await this.db.delete(announcements).where(eq(announcements.id, id));
    await this.audit.record({
      action: 'announcement.deleted',
      entity: 'announcement',
      entityId: id,
      before,
    });
    return { deleted: true };
  }
}
