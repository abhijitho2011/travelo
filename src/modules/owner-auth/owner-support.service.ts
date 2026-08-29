import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, ilike, isNull, sql, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { properties, supportMessages, supportTickets } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { CreateTicketDto, TicketFilterDto } from './dto';
import { OwnerErrors } from './owner-errors';

type TicketRow = typeof supportTickets.$inferSelect;
type MessageRow = typeof supportMessages.$inferSelect;

/** `support_messages.author_type` for a message written from the owner app. */
const OWNER_AUTHOR = 'OWNER';

/**
 * Owner-facing support desk over the SAME `support_tickets` / `support_messages`
 * tables the admin console uses, so a reply typed by an agent lands in the
 * owner's thread with no syncing.
 *
 * Two rules hold everywhere in this service:
 *   1. every query is filtered by `owner_id` — an id from another tenant 404s;
 *   2. `is_internal_note` messages are NEVER selected. Those are the agents'
 *      private working notes and must not reach the owner.
 */
@Injectable()
export class OwnerSupportService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  private static ticketDto(t: TicketRow, propertyName?: string | null) {
    return {
      id: t.id,
      subject: t.subject,
      category: t.category,
      priority: t.priority,
      status: t.status,
      propertyId: t.propertyId,
      propertyName: propertyName ?? null,
      firstResponseAt: t.firstResponseAt,
      resolvedAt: t.resolvedAt,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  /**
   * Messages are flattened to "mine" vs "Tavelo Support". The agent's admin id
   * is intentionally dropped — the owner has no use for it.
   */
  private static messageDto(m: MessageRow) {
    const mine = m.authorType === OWNER_AUTHOR;
    return {
      id: m.id,
      body: m.body,
      mine,
      authorLabel: mine ? 'You' : 'Tavelo Support',
      createdAt: m.createdAt,
    };
  }

  async list(ownerId: string, filter: TicketFilterDto) {
    const limit = Math.min(filter.limit ?? 50, 100);
    const offset = filter.offset ?? 0;
    const conds: SQL[] = [eq(supportTickets.ownerId, ownerId)];
    if (filter.status) conds.push(eq(supportTickets.status, filter.status));
    if (filter.q) conds.push(ilike(supportTickets.subject, `%${filter.q}%`));
    const where = and(...conds);

    const rows = await this.db
      .select({ t: supportTickets, propertyName: properties.name })
      .from(supportTickets)
      .leftJoin(properties, eq(supportTickets.propertyId, properties.id))
      .where(where)
      .orderBy(desc(supportTickets.createdAt))
      .limit(limit)
      .offset(offset);
    const [total] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(supportTickets)
      .where(where);

    return {
      items: rows.map((r) => OwnerSupportService.ticketDto(r.t, r.propertyName)),
      total: total?.count ?? 0,
      limit,
      offset,
    };
  }

  /** The ticket, or 404 — including when it belongs to a different owner. */
  private async loadOwnedTicket(ownerId: string, ticketId: string): Promise<TicketRow> {
    const [row] = await this.db
      .select()
      .from(supportTickets)
      .where(and(eq(supportTickets.id, ticketId), eq(supportTickets.ownerId, ownerId)))
      .limit(1);
    if (!row) throw OwnerErrors.ticketNotFound();
    return row;
  }

  async get(ownerId: string, ticketId: string) {
    const ticket = await this.loadOwnedTicket(ownerId, ticketId);
    const messages = await this.db
      .select()
      .from(supportMessages)
      .where(
        and(
          eq(supportMessages.ticketId, ticketId),
          // Internal admin notes are invisible to the owner. This predicate is
          // the only thing standing between an agent's private note and the
          // customer — see owner-support.service.spec.ts.
          eq(supportMessages.isInternalNote, false),
        ),
      )
      .orderBy(asc(supportMessages.createdAt));
    return {
      ...OwnerSupportService.ticketDto(ticket),
      messages: messages.map((m) => OwnerSupportService.messageDto(m)),
    };
  }

  /**
   * A ticket and its opening message are written together — a ticket with no
   * message would render as an empty thread, so the two are one transaction.
   */
  async create(ownerId: string, dto: CreateTicketDto) {
    if (dto.propertyId) await this.assertOwnedProperty(ownerId, dto.propertyId);

    const created = await this.db.transaction(async (tx) => {
      const [ticket] = await tx
        .insert(supportTickets)
        .values({
          ownerId,
          propertyId: dto.propertyId,
          subject: dto.subject.trim(),
          priority: dto.priority ?? 'NORMAL',
          status: 'OPEN',
        })
        .returning();
      const [message] = await tx
        .insert(supportMessages)
        .values({
          ticketId: ticket.id,
          authorType: OWNER_AUTHOR,
          authorId: ownerId,
          body: dto.message.trim(),
          isInternalNote: false,
        })
        .returning();
      return { ticket, message };
    });

    await this.audit.record({
      action: 'owner.support.ticket.created',
      entity: 'ticket',
      entityId: created.ticket.id,
      after: created.ticket,
      actorId: ownerId,
      actorRole: 'OWNER',
    });
    return {
      ...OwnerSupportService.ticketDto(created.ticket),
      messages: [OwnerSupportService.messageDto(created.message)],
    };
  }

  async addMessage(ownerId: string, ticketId: string, body: string) {
    const ticket = await this.loadOwnedTicket(ownerId, ticketId);
    const [message] = await this.db
      .insert(supportMessages)
      .values({
        ticketId: ticket.id,
        authorType: OWNER_AUTHOR,
        authorId: ownerId,
        body: body.trim(),
        isInternalNote: false,
      })
      .returning();
    await this.db
      .update(supportTickets)
      .set({ updatedAt: new Date() })
      .where(eq(supportTickets.id, ticket.id));
    await this.audit.record({
      action: 'owner.support.message.sent',
      entity: 'ticket',
      entityId: ticket.id,
      after: { messageId: message.id },
      actorId: ownerId,
      actorRole: 'OWNER',
    });
    return OwnerSupportService.messageDto(message);
  }

  private async assertOwnedProperty(ownerId: string, propertyId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: properties.id })
      .from(properties)
      .where(
        and(
          eq(properties.id, propertyId),
          eq(properties.ownerId, ownerId),
          isNull(properties.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw OwnerErrors.propertyNotFound();
  }
}
