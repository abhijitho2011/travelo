import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { desc, eq } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { announcements } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { getRequestContext } from '../../common/context/request-context';

@Injectable()
export class AnnouncementsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
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
    return after;
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
