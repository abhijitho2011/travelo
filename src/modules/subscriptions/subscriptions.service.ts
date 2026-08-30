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
import { addMonths } from '../../common/date/add-months';

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

  /**
   * A billing period runs for the plan's `durationMonths` — never a hard-coded
   * month or year. Day-of-month is clamped (Jan 31 + 1 month => Feb 28/29).
   */
  static computePeriodEnd(start: Date, durationMonths: number): Date {
    if (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 120) {
      throw new BadRequestException('durationMonths must be an integer between 1 and 120');
    }
    return addMonths(start, durationMonths);
  }

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
    // The period length comes from the plan, not from the billing cycle label.
    const cycle = dto.billingCycle ?? (plan.durationMonths % 12 === 0 ? 'ANNUAL' : 'MONTHLY');
    const start = dto.startsAt ?? new Date();
    const end = SubscriptionsService.computePeriodEnd(start, plan.durationMonths);
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

  /**
   * Prorated plan change (item 2.5).
   *
   * Credits the unused portion of the CURRENT period against the new plan's
   * cost, then either shortens the amount due or — when the credit exceeds the
   * new cost — extends the new period by the equivalent days. Pure so the maths
   * is unit-tested without a database.
   */
  static computeProration(input: {
    now: Date;
    periodStart: Date;
    periodEnd: Date;
    currentPeriodTotalPaise: number;
    newMonthlyPaise: number;
    newDurationMonths: number;
  }): {
    creditPaise: number;
    newCostPaise: number;
    amountDuePaise: number;
    newPeriodStart: Date;
    newPeriodEnd: Date;
  } {
    const DAY = 86_400_000;
    const totalDays = Math.max(
      1,
      Math.round((input.periodEnd.getTime() - input.periodStart.getTime()) / DAY),
    );
    const remainingDays = Math.min(
      totalDays,
      Math.max(0, Math.round((input.periodEnd.getTime() - input.now.getTime()) / DAY)),
    );
    const creditPaise = Math.round((input.currentPeriodTotalPaise * remainingDays) / totalDays);
    const newCostPaise = input.newMonthlyPaise * input.newDurationMonths;

    const newPeriodStart = input.now;
    let newPeriodEnd = addMonths(newPeriodStart, input.newDurationMonths);
    let amountDuePaise = newCostPaise - creditPaise;

    if (amountDuePaise < 0) {
      // Leftover credit buys extra days on the new plan rather than a refund.
      const newPeriodDays = Math.max(
        1,
        Math.round((newPeriodEnd.getTime() - newPeriodStart.getTime()) / DAY),
      );
      const newDailyRate = newCostPaise / newPeriodDays;
      const extraDays = newDailyRate > 0 ? Math.floor(-amountDuePaise / newDailyRate) : 0;
      newPeriodEnd = new Date(newPeriodEnd.getTime() + extraDays * DAY);
      amountDuePaise = 0;
    }
    return { creditPaise, newCostPaise, amountDuePaise, newPeriodStart, newPeriodEnd };
  }

  async changePlan(id: string, dto: { planId: string; reason?: string }, now: Date = new Date()) {
    const before = await this.get(id);
    const [currentPlan] = await this.db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, before.planId))
      .limit(1);
    const [newPlan] = await this.db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, dto.planId))
      .limit(1);
    if (!newPlan) throw new NotFoundException('Target plan not found');
    if (newPlan.id === before.planId) {
      throw new BadRequestException('The subscription is already on that plan');
    }

    const currentPeriodTotalPaise =
      before.priceOverride ??
      (currentPlan ? currentPlan.monthlyPrice * currentPlan.durationMonths : 0);
    const proration = SubscriptionsService.computeProration({
      now,
      periodStart: before.currentPeriodStart,
      periodEnd: before.currentPeriodEnd,
      currentPeriodTotalPaise,
      newMonthlyPaise: newPlan.monthlyPrice,
      newDurationMonths: newPlan.durationMonths,
    });

    const cycle: BillingCycle = newPlan.durationMonths % 12 === 0 ? 'ANNUAL' : 'MONTHLY';
    await this.db.transaction(async (tx) => {
      await tx
        .update(subscriptions)
        .set({
          planId: newPlan.id,
          billingCycle: cycle,
          // The new plan carries its own pricing — any bespoke override from the
          // old plan is cleared so it cannot bleed into the new one.
          priceOverride: null,
          currentPeriodStart: proration.newPeriodStart,
          currentPeriodEnd: proration.newPeriodEnd,
          status: 'ACTIVE',
          updatedAt: now,
        })
        .where(eq(subscriptions.id, id));
      await tx.insert(subscriptionEvents).values({
        subscriptionId: id,
        type: 'plan_changed',
        actorAdminId: getRequestContext()?.adminId ?? null,
        payload: {
          fromPlanId: before.planId,
          toPlanId: newPlan.id,
          creditPaise: proration.creditPaise,
          newCostPaise: proration.newCostPaise,
          amountDuePaise: proration.amountDuePaise,
          reason: dto.reason ?? null,
        } as never,
      });
    });

    const after = await this.get(id);
    await this.audit.record({
      action: 'subscription.plan_changed',
      entity: 'subscription',
      entityId: id,
      before,
      after,
      reason: dto.reason,
    });
    return { ...after, proration };
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
