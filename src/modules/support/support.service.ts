import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, ilike, inArray, sql, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  admins,
  owners,
  properties,
  supportAttachments,
  supportMessages,
  supportTickets,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { getRequestContext } from '../../common/context/request-context';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service';
import { inAppRecipient } from '../notifications/channels/channel.interface';
import { StorageService } from '../storage/storage.service';
import {
  assertValidAttachment,
  attachmentObjectKey,
  ATTACHMENT_URL_TTL_SECONDS,
  UploadedAttachment,
} from './support-attachment.util';

@Injectable()
export class SupportService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly notifications: NotificationDeliveryService,
    private readonly storage: StorageService,
  ) {}

  /**
   * attachments keyed by message id, each with a freshly presigned download URL.
   * `support_attachments.url` holds the object STORAGE KEY, so it is presigned
   * here rather than returned raw.
   */
  private async attachmentsByMessage(messageIds: string[]): Promise<
    Map<
      string,
      Array<{
        id: string;
        filename: string;
        mimeType: string | null;
        size: number | null;
        url: string;
      }>
    >
  > {
    const map = new Map<
      string,
      Array<{
        id: string;
        filename: string;
        mimeType: string | null;
        size: number | null;
        url: string;
      }>
    >();
    if (!messageIds.length) return map;
    const rows = await this.db
      .select()
      .from(supportAttachments)
      .where(inArray(supportAttachments.messageId, messageIds));
    await Promise.all(
      rows.map(async (r) => {
        const list = map.get(r.messageId) ?? [];
        list.push({
          id: r.id,
          filename: r.filename,
          mimeType: r.mimeType,
          size: r.size,
          url: await this.storage.getSignedUrl(r.url, ATTACHMENT_URL_TTL_SECONDS),
        });
        map.set(r.messageId, list);
      }),
    );
    return map;
  }

  async list(params: {
    limit?: number;
    offset?: number;
    status?: string;
    q?: string;
    ownerId?: string;
  }) {
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;
    const conds: SQL[] = [];
    if (params.status) conds.push(eq(supportTickets.status, params.status));
    if (params.ownerId) conds.push(eq(supportTickets.ownerId, params.ownerId));
    if (params.q) conds.push(ilike(supportTickets.subject, `%${params.q}%`));
    const where = conds.length ? and(...conds) : undefined;
    const rows = await this.db
      .select({
        t: supportTickets,
        owner: owners.company,
        hotel: properties.name,
        assigned: admins.name,
      })
      .from(supportTickets)
      .leftJoin(owners, eq(supportTickets.ownerId, owners.id))
      .leftJoin(properties, eq(supportTickets.propertyId, properties.id))
      .leftJoin(admins, eq(supportTickets.assignedAdminId, admins.id))
      .where(where)
      .orderBy(desc(supportTickets.createdAt))
      .limit(limit)
      .offset(offset);
    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(supportTickets)
      .where(where);
    return {
      items: rows.map((r) => ({
        ...r.t,
        owner: r.owner,
        hotel: r.hotel,
        assigned: r.assigned ?? 'Unassigned',
      })),
      total,
      limit,
      offset,
    };
  }

  async create(dto: {
    ownerId?: string;
    propertyId?: string;
    subject: string;
    category?: string;
    priority?: string;
    body?: string;
  }) {
    const ctx = getRequestContext();
    const [t] = await this.db
      .insert(supportTickets)
      .values({
        ownerId: dto.ownerId,
        propertyId: dto.propertyId,
        subject: dto.subject,
        category: dto.category,
        priority: dto.priority ?? 'NORMAL',
      })
      .returning();
    if (dto.body) {
      await this.db.insert(supportMessages).values({
        ticketId: t.id,
        authorType: 'ADMIN',
        authorId: ctx?.adminId,
        body: dto.body,
      });
    }
    await this.audit.record({
      action: 'support.ticket.created',
      entity: 'ticket',
      entityId: t.id,
      after: t,
    });
    const ticket = await this.get(t.id);
    await this.announceCreated(ticket);
    return ticket;
  }

  async get(id: string) {
    const [row] = await this.db
      .select({
        t: supportTickets,
        owner: owners.company,
        hotel: properties.name,
        assigned: admins.name,
      })
      .from(supportTickets)
      .leftJoin(owners, eq(supportTickets.ownerId, owners.id))
      .leftJoin(properties, eq(supportTickets.propertyId, properties.id))
      .leftJoin(admins, eq(supportTickets.assignedAdminId, admins.id))
      .where(eq(supportTickets.id, id))
      .limit(1);
    if (!row) throw new NotFoundException('Ticket not found');
    const msgs = await this.db
      .select()
      .from(supportMessages)
      .where(eq(supportMessages.ticketId, id))
      .orderBy(supportMessages.createdAt);
    const attachments = await this.attachmentsByMessage(msgs.map((m) => m.id));
    return {
      ...row.t,
      owner: row.owner,
      hotel: row.hotel,
      assigned: row.assigned ?? 'Unassigned',
      messages: msgs.map((m) => ({ ...m, attachments: attachments.get(m.id) ?? [] })),
    };
  }

  /**
   * A support attachment must hang off a message (the schema FK). Rather than
   * demand the caller name one, we author a short admin message to carry it, so
   * the upload is always tied to a real, thread-visible message.
   */
  async addAttachment(ticketId: string, file: UploadedAttachment | undefined) {
    assertValidAttachment(file);
    const [ticket] = await this.db
      .select({ id: supportTickets.id })
      .from(supportTickets)
      .where(eq(supportTickets.id, ticketId))
      .limit(1);
    if (!ticket) throw new NotFoundException('Ticket not found');

    const ctx = getRequestContext();
    const [msg] = await this.db
      .insert(supportMessages)
      .values({
        ticketId,
        authorType: 'ADMIN',
        authorId: ctx?.adminId,
        body: `Shared an attachment: ${file.originalname ?? 'file'}`,
      })
      .returning();

    const key = attachmentObjectKey(ticketId, msg.id, file.originalname);
    await this.storage.put(key, file.buffer, file.mimetype);
    const [att] = await this.db
      .insert(supportAttachments)
      .values({
        messageId: msg.id,
        filename: file.originalname ?? 'file',
        url: key,
        mimeType: file.mimetype,
        size: file.size,
      })
      .returning();

    await this.db
      .update(supportTickets)
      .set({ updatedAt: new Date() })
      .where(eq(supportTickets.id, ticketId));
    await this.audit.record({
      action: 'support.attachment.added',
      entity: 'ticket',
      entityId: ticketId,
      after: { messageId: msg.id, attachmentId: att.id },
    });
    return {
      id: att.id,
      filename: att.filename,
      mimeType: att.mimeType,
      size: att.size,
      url: await this.storage.getSignedUrl(key, ATTACHMENT_URL_TTL_SECONDS),
    };
  }

  async postMessage(ticketId: string, dto: { body: string; isInternalNote?: boolean }) {
    const ctx = getRequestContext();
    const [msg] = await this.db
      .insert(supportMessages)
      .values({
        ticketId,
        authorType: 'ADMIN',
        authorId: ctx?.adminId,
        body: dto.body,
        isInternalNote: dto.isInternalNote ?? false,
      })
      .returning();
    await this.db
      .update(supportTickets)
      .set({
        updatedAt: new Date(),
        firstResponseAt: sql`coalesce(first_response_at, now())` as never,
      })
      .where(eq(supportTickets.id, ticketId));
    await this.audit.record({
      action: 'support.message.sent',
      entity: 'ticket',
      entityId: ticketId,
      after: msg,
    });
    // An internal note is admin-to-admin: the owner must never see it, so it
    // is not a reply and raises nothing.
    if (!msg.isInternalNote) await this.announceReply(ticketId, dto.body);
    return msg;
  }

  /** Post-write and best-effort — a ticket exists whether or not anyone is told. */
  private async announceCreated(ticket: {
    id: string;
    subject: string;
    priority: string | null;
    category: string | null;
    owner: string | null;
  }): Promise<void> {
    const desk = await this.notifications.adminsWithPermission('support.view');
    for (const admin of desk) {
      await this.notifications.notifyQuietly({
        key: 'support.ticket.created',
        relatedType: 'ticket',
        relatedId: ticket.id,
        targets: [{ channel: 'IN_APP', to: inAppRecipient('admin', admin.id) }],
        vars: {
          subject: ticket.subject,
          priority: ticket.priority ?? 'NORMAL',
          category: ticket.category ?? 'General',
          ownerName: ticket.owner ?? 'An owner',
        },
      });
    }
  }

  /** An admin replied — the owner who raised the ticket gets email + in-app. */
  private async announceReply(ticketId: string, body: string): Promise<void> {
    const [row] = await this.db
      .select({
        subject: supportTickets.subject,
        ownerId: supportTickets.ownerId,
        ownerName: owners.name,
        ownerEmail: owners.email,
      })
      .from(supportTickets)
      .leftJoin(owners, eq(supportTickets.ownerId, owners.id))
      .where(eq(supportTickets.id, ticketId))
      .limit(1);
    if (!row?.ownerId) return;
    await this.notifications.notifyQuietly({
      key: 'support.ticket.replied',
      relatedType: 'ticket',
      relatedId: ticketId,
      targets: [
        { channel: 'EMAIL', to: row.ownerEmail ?? '' },
        { channel: 'IN_APP', to: inAppRecipient('owner', row.ownerId) },
      ],
      vars: {
        subject: row.subject,
        ownerName: row.ownerName ?? 'there',
        message: body,
      },
    });
  }

  async assign(ticketId: string, adminId: string) {
    await this.db
      .update(supportTickets)
      .set({ assignedAdminId: adminId, updatedAt: new Date() })
      .where(eq(supportTickets.id, ticketId));
    await this.audit.record({
      action: 'support.ticket.assigned',
      entity: 'ticket',
      entityId: ticketId,
      after: { adminId },
    });
    return this.get(ticketId);
  }

  async setStatus(
    ticketId: string,
    status: 'RESOLVED' | 'CLOSED' | 'IN_PROGRESS' | 'WAITING_FOR_OWNER',
  ) {
    const patch: Record<string, unknown> = { status, updatedAt: new Date() };
    if (status === 'RESOLVED') patch.resolvedAt = new Date();
    await this.db.update(supportTickets).set(patch).where(eq(supportTickets.id, ticketId));
    await this.audit.record({
      action: `support.ticket.${status.toLowerCase()}`,
      entity: 'ticket',
      entityId: ticketId,
      after: { status },
    });
    return this.get(ticketId);
  }
}
