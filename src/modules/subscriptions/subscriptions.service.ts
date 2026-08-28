import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  BillingCycle,
  owners,
  subscriptionEvents,
  subscriptionExtensions,
  subscriptionPlans,
  subscriptions,
  SubscriptionStatus,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { getRequestContext } from '../../common/context/request-context';

export interface ExtendInput {
  days: number;
  reason?: string;
  extendFrom?: 'expiry' | 'now';
  idempotencyKey?: string;
}

@Injectable()
export class SubscriptionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  static computeNewExpiry(
    current: Date,
    days: number,
    now: Date,
    extendFrom: 'expiry' | 'now' = 'expiry',
  ): Date {
    if (days <= 0) throw new BadRequestException('days must be positive');
    const base =
      extendFrom === 'now'
        ? new Date(Math.max(now.getTime(), current.getTime()))
        : current.getTime() >= now.getTime()
          ? current
          : now;
    return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  }

  async list(params: { limit?: number; offset?: number; ownerId?: string; status?: string }) {
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;
    const conds = [] as ReturnType<typeof eq>[];
    if (params.ownerId) conds.push(eq(subscriptions.ownerId, params.ownerId));
    if (params.status) conds.push(eq(subscriptions.status, params.status as SubscriptionStatus));
    const where = conds.length ? and(...conds) : undefined;
    const rows = await this.db
      .select({
        s: subscriptions,
        planName: subscriptionPlans.name,
        propertyLimit: subscriptionPlans.propertyLimit,
        ownerCompany: owners.company,
      })
      .from(subscriptions)
      .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
      .leftJoin(owners, eq(subscriptions.ownerId, owners.id))
      .where(where)
      .orderBy(desc(subscriptions.createdAt))
      .limit(limit)
      .offset(offset);
    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(subscriptions)
      .where(where);
    return {
      items: rows.map((r) => this.serialize(r)),
      total,
      limit,
      offset,
    };
  }

  async create(dto: {
    ownerId: string;
    planId: string;
    billingCycle?: BillingCycle;
    startsAt?: Date;
    propertyLimitOverride?: number;
    priceOverride?: number;
  }) {
    const [plan] = await this.db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, dto.planId))
      .limit(1);
    if (!plan) throw new NotFoundException('Plan not found');
    const cycle = dto.billingCycle ?? 'MONTHLY';
    const start = dto.startsAt ?? new Date();
    const end = new Date(start);
    if (cycle === 'ANNUAL') end.setFullYear(end.getFullYear() + 1);
    else end.setMonth(end.getMonth() + 1);
    const [row] = await this.db
      .insert(subscriptions)
      .values({
        ownerId: dto.ownerId,
        planId: dto.planId,
        billingCycle: cycle,
        startsAt: start,
        currentPeriodStart: start,
        currentPeriodEnd: end,
        propertyLimitOverride: dto.propertyLimitOverride,
        priceOverride: dto.priceOverride,
        status: 'ACTIVE',
      })
      .returning();
    await this.audit.record({
      action: 'subscription.created',
      entity: 'subscription',
      entityId: row.id,
      after: row,
    });
    return this.get(row.id);
  }

  async get(id: string) {
    const [row] = await this.db
      .select({
        s: subscriptions,
        planName: subscriptionPlans.name,
        propertyLimit: subscriptionPlans.propertyLimit,
        ownerCompany: owners.company,
      })
      .from(subscriptions)
      .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
      .leftJoin(owners, eq(subscriptions.ownerId, owners.id))
      .where(eq(subscriptions.id, id))
      .limit(1);
    if (!row) throw new NotFoundException('Subscription not found');
    return this.serialize(row);
  }

  async update(
    id: string,
    dto: Partial<{
      planId: string;
      billingCycle: BillingCycle;
      autoRenew: boolean;
      propertyLimitOverride: number;
      priceOverride: number;
    }>,
  ) {
    const before = await this.get(id);
    await this.db
      .update(subscriptions)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(subscriptions.id, id));
    const after = await this.get(id);
    await this.audit.record({
      action: 'subscription.updated',
      entity: 'subscription',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  async extend(id: string, input: ExtendInput) {
    const ctx = getRequestContext();
    return this.db.transaction(async (tx) => {
      if (input.idempotencyKey) {
        const [dupe] = await tx
          .select()
          .from(subscriptionExtensions)
          .where(
            and(
              eq(subscriptionExtensions.subscriptionId, id),
              eq(subscriptionExtensions.idempotencyKey, input.idempotencyKey),
            ),
          )
          .limit(1);
        if (dupe) return { extension: dupe, replayed: true };
      }
      const [sub] = await tx.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
      if (!sub) throw new NotFoundException('Subscription not found');
      const now = new Date();
      const newExpiry = SubscriptionsService.computeNewExpiry(
        sub.currentPeriodEnd,
        input.days,
        now,
        input.extendFrom,
      );
      await tx
        .update(subscriptions)
        .set({
          currentPeriodEnd: newExpiry,
          status: 'ACTIVE',
          updatedAt: now,
        })
        .where(eq(subscriptions.id, id));
      const [ext] = await tx
        .insert(subscriptionExtensions)
        .values({
          subscriptionId: id,
          days: input.days,
          reason: input.reason,
          actorAdminId: ctx?.adminId,
          previousExpiry: sub.currentPeriodEnd,
          newExpiry,
          idempotencyKey: input.idempotencyKey,
        })
        .returning();
      await tx.insert(subscriptionEvents).values({
        subscriptionId: id,
        type: 'extension',
        actorAdminId: ctx?.adminId,
        payload: {
          days: input.days,
          reason: input.reason,
          previousExpiry: sub.currentPeriodEnd,
          newExpiry,
        },
      });
      await this.audit.record({
        action: 'subscription.extended',
        entity: 'subscription',
        entityId: id,
        before: { currentPeriodEnd: sub.currentPeriodEnd },
        after: { currentPeriodEnd: newExpiry },
        reason: input.reason,
      });
      return { extension: ext, replayed: false };
    });
  }

  async setStatus(id: string, status: SubscriptionStatus, reason?: string) {
    const before = await this.get(id);
    const ctx = getRequestContext();
    await this.db
      .update(subscriptions)
      .set({ status, updatedAt: new Date() })
      .where(eq(subscriptions.id, id));
    await this.db.insert(subscriptionEvents).values({
      subscriptionId: id,
      type: `status.${status.toLowerCase()}`,
      actorAdminId: ctx?.adminId,
      payload: { reason },
    });
    const after = await this.get(id);
    await this.audit.record({
      action: `subscription.status.${status.toLowerCase()}`,
      entity: 'subscription',
      entityId: id,
      before,
      after,
      reason,
    });
    return after;
  }

  async listEvents(id: string) {
    return this.db
      .select()
      .from(subscriptionEvents)
      .where(eq(subscriptionEvents.subscriptionId, id))
      .orderBy(desc(subscriptionEvents.at));
  }

  private serialize(row: {
    s: typeof subscriptions.$inferSelect;
    planName: string;
    propertyLimit: number;
    ownerCompany: string | null;
  }) {
    return {
      id: row.s.id,
      ownerId: row.s.ownerId,
      owner: row.ownerCompany,
      planId: row.s.planId,
      plan: row.planName,
      status: row.s.status,
      cycle: row.s.billingCycle,
      autoRenew: row.s.autoRenew,
      startsAt: row.s.startsAt,
      currentPeriodStart: row.s.currentPeriodStart,
      currentPeriodEnd: row.s.currentPeriodEnd,
      propertyLimit: row.s.propertyLimitOverride ?? row.propertyLimit,
      priceOverride: row.s.priceOverride,
      createdAt: row.s.createdAt,
    };
  }
}
