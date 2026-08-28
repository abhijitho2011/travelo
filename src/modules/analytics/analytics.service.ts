import { Inject, Injectable } from '@nestjs/common';
import { and, between, desc, eq, gte, isNotNull, lte, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  dailyPlatformMetrics,
  owners,
  properties,
  subscriptionPlans,
  subscriptions,
} from '../../database/schema';

@Injectable()
export class AnalyticsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async overview() {
    const [{ ownersTotal }] = await this.db
      .select({ ownersTotal: sql<number>`count(*)::int` })
      .from(owners);
    const [{ ownersActive }] = await this.db
      .select({ ownersActive: sql<number>`count(*) filter (where status='ACTIVE')::int` })
      .from(owners);
    const [{ propertiesTotal }] = await this.db
      .select({ propertiesTotal: sql<number>`count(*)::int` })
      .from(properties);
    const [{ rooms }] = await this.db
      .select({ rooms: sql<number>`coalesce(sum(room_count),0)::int` })
      .from(properties);
    const [{ subsActive }] = await this.db
      .select({
        subsActive: sql<number>`count(*) filter (where status in ('ACTIVE','TRIAL'))::int`,
      })
      .from(subscriptions);
    const [{ expiringSoon }] = await this.db
      .select({
        expiringSoon: sql<number>`count(*) filter (where status in ('EXPIRING','GRACE_PERIOD') or (status='ACTIVE' and current_period_end < now() + interval '7 days'))::int`,
      })
      .from(subscriptions);
    const mrrRows = await this.db
      .select({
        cycle: subscriptions.billingCycle,
        monthly: subscriptionPlans.monthlyPrice,
        annual: subscriptionPlans.annualPrice,
        override: subscriptions.priceOverride,
      })
      .from(subscriptions)
      .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
      .where(eq(subscriptions.status, 'ACTIVE'));
    let mrr = 0;
    for (const r of mrrRows) {
      const base =
        r.cycle === 'ANNUAL'
          ? Math.round((r.override ?? r.annual) / 12)
          : (r.override ?? r.monthly);
      mrr += base;
    }
    const arr = mrr * 12;
    const arpu = mrrRows.length ? Math.round(mrr / mrrRows.length) : 0;
    return {
      ownersTotal,
      ownersActive,
      propertiesTotal,
      rooms,
      subsActive,
      expiringSoon,
      mrr,
      arr,
      arpu,
    };
  }

  async subscriptionHealth() {
    const rows = await this.db
      .select({ status: subscriptions.status, count: sql<number>`count(*)::int` })
      .from(subscriptions)
      .groupBy(subscriptions.status);
    return rows;
  }

  async ownerSummary() {
    const rows = await this.db
      .select({ status: owners.status, count: sql<number>`count(*)::int` })
      .from(owners)
      .groupBy(owners.status);
    return rows;
  }

  async revenueSeries(fromISO?: string, toISO?: string) {
    const to = toISO ? new Date(toISO) : new Date();
    const from = fromISO ? new Date(fromISO) : new Date(to.getTime() - 180 * 86400_000);
    return this.db
      .select()
      .from(dailyPlatformMetrics)
      .where(
        and(
          gte(dailyPlatformMetrics.day, from.toISOString().slice(0, 10)),
          lte(dailyPlatformMetrics.day, to.toISOString().slice(0, 10)),
        ),
      )
      .orderBy(dailyPlatformMetrics.day);
  }

  async dashboard() {
    const [overview, health, ownerBreakdown, series] = await Promise.all([
      this.overview(),
      this.subscriptionHealth(),
      this.ownerSummary(),
      this.revenueSeries(),
    ]);
    return { overview, subscriptionHealth: health, ownerBreakdown, revenueSeries: series };
  }
}
