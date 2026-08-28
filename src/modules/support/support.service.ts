import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, ilike, sql, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { admins, owners, properties, supportMessages, supportTickets } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { getRequestContext } from '../../common/context/request-context';

@Injectable()
export class SupportService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

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
    return this.get(t.id);
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
    return {
      ...row.t,
      owner: row.owner,
      hotel: row.hotel,
      assigned: row.assigned ?? 'Unassigned',
      messages: msgs,
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
    return msg;
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
