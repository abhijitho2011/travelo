import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, ilike, isNull, or, sql, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  owners,
  properties,
  subscriptions,
  supportTickets,
  subscriptionPlans,
  OwnerStatus,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { getRequestContext } from '../../common/context/request-context';
import { CreateOwnerDto, OwnerFilterDto, UpdateOwnerDto } from './dto';

@Injectable()
export class OwnersService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async list(filter: OwnerFilterDto) {
    const limit = Math.min(filter.limit ?? 50, 200);
    const offset = filter.offset ?? 0;
    const conds: SQL[] = [isNull(owners.deletedAt)];
    if (filter.status) conds.push(eq(owners.status, filter.status as OwnerStatus));
    if (filter.q) {
      const q = `%${filter.q}%`;
      conds.push(or(ilike(owners.name, q), ilike(owners.email, q), ilike(owners.company, q))!);
    }
    const where = and(...conds);
    const rows = await this.db
      .select()
      .from(owners)
      .where(where)
      .orderBy(desc(owners.createdAt))
      .limit(limit)
      .offset(offset);
    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(owners)
      .where(where);
    return { items: rows.map(this.serialize), total, limit, offset };
  }

  async create(dto: CreateOwnerDto) {
    const existing = await this.db
      .select({ id: owners.id })
      .from(owners)
      .where(eq(owners.email, dto.email.toLowerCase()))
      .limit(1);
    if (existing.length) throw new ConflictException('Owner email already exists');
    const ctx = getRequestContext();
    const [row] = await this.db
      .insert(owners)
      .values({
        name: dto.name,
        email: dto.email.toLowerCase(),
        phone: dto.phone,
        company: dto.company,
        gstNumber: dto.gstNumber,
        city: dto.city,
        country: dto.country,
        address: dto.address as never,
        createdBy: ctx?.adminId,
        status: 'PENDING',
      })
      .returning();
    await this.audit.record({
      action: 'owner.created',
      entity: 'owner',
      entityId: row.id,
      after: row,
    });
    return this.serialize(row);
  }

  async get(id: string) {
    const [row] = await this.db.select().from(owners).where(eq(owners.id, id)).limit(1);
    if (!row || row.deletedAt) throw new NotFoundException('Owner not found');
    return this.serialize(row);
  }

  async update(id: string, dto: UpdateOwnerDto) {
    const before = await this.get(id);
    await this.db
      .update(owners)
      .set({ ...dto, address: dto.address as never, updatedAt: new Date() })
      .where(eq(owners.id, id));
    const after = await this.get(id);
    await this.audit.record({
      action: 'owner.updated',
      entity: 'owner',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  async setStatus(id: string, status: OwnerStatus, reason?: string) {
    const before = await this.get(id);
    await this.db.update(owners).set({ status, updatedAt: new Date() }).where(eq(owners.id, id));
    const after = await this.get(id);
    await this.audit.record({
      action: `owner.status.${status.toLowerCase()}`,
      entity: 'owner',
      entityId: id,
      before,
      after,
      reason,
    });
    return after;
  }

  async overview(id: string) {
    const owner = await this.get(id);
    const [propStats] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(properties)
      .where(eq(properties.ownerId, id));
    const [sub] = await this.db
      .select({
        id: subscriptions.id,
        status: subscriptions.status,
        cycle: subscriptions.billingCycle,
        currentPeriodEnd: subscriptions.currentPeriodEnd,
        planName: subscriptionPlans.name,
        monthlyPrice: subscriptionPlans.monthlyPrice,
        annualPrice: subscriptionPlans.annualPrice,
      })
      .from(subscriptions)
      .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
      .where(eq(subscriptions.ownerId, id))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    const [ticketStats] = await this.db
      .select({
        open: sql<number>`count(*) filter (where status in ('OPEN','IN_PROGRESS','WAITING_FOR_OWNER'))::int`,
      })
      .from(supportTickets)
      .where(eq(supportTickets.ownerId, id));
    const mrr = sub
      ? sub.cycle === 'ANNUAL'
        ? Math.round(sub.annualPrice / 12)
        : sub.monthlyPrice
      : 0;
    return {
      owner,
      propertiesCount: propStats.count,
      activeSubscription: sub ?? null,
      mrrContribution: mrr,
      openTickets: ticketStats.open,
      lastActivity: owner.lastActiveAt ?? owner.updatedAt,
    };
  }

  async listProperties(ownerId: string) {
    return this.db.select().from(properties).where(eq(properties.ownerId, ownerId));
  }

  private serialize = (r: typeof owners.$inferSelect) => ({
    id: r.id,
    name: r.name,
    email: r.email,
    phone: r.phone,
    company: r.company,
    gstNumber: r.gstNumber,
    address: r.address,
    city: r.city,
    country: r.country,
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    lastActiveAt: r.lastActiveAt,
  });
}
