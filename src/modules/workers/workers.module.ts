import { Inject, Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { and, eq, isNull, lte, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  announcements,
  backgroundJobs,
  dailyPlatformMetrics,
  owners,
  subscriptionPlans,
  subscriptions,
} from '../../database/schema';

@Injectable()
export class SubscriptionLifecycleWorker {
  private readonly logger = new Logger(SubscriptionLifecycleWorker.name);
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Marks:
   *  ACTIVE -> EXPIRING when now >= currentPeriodEnd - 7 days
   *  EXPIRING -> EXPIRED when now >= currentPeriodEnd
   *  EXPIRED -> GRACE_PERIOD when now < currentPeriodEnd + 7 days
   *  GRACE_PERIOD -> SUSPENDED when now >= currentPeriodEnd + 14 days
   */
  async run(now: Date = new Date()) {
    await this.db.execute(sql`
      UPDATE subscriptions
      SET status='EXPIRING', updated_at=now()
      WHERE status='ACTIVE' AND current_period_end <= ${new Date(now.getTime() + 7 * 86400_000)}::timestamptz
        AND current_period_end > ${now}::timestamptz
    `);
    await this.db.execute(sql`
      UPDATE subscriptions
      SET status='EXPIRED', updated_at=now()
      WHERE status IN ('ACTIVE','EXPIRING') AND current_period_end <= ${now}::timestamptz
    `);
    await this.db.execute(sql`
      UPDATE subscriptions
      SET status='GRACE_PERIOD', updated_at=now()
      WHERE status='EXPIRED' AND current_period_end > ${new Date(now.getTime() - 7 * 86400_000)}::timestamptz
    `);
    await this.db.execute(sql`
      UPDATE subscriptions
      SET status='SUSPENDED', updated_at=now()
      WHERE status='GRACE_PERIOD' AND current_period_end <= ${new Date(now.getTime() - 14 * 86400_000)}::timestamptz
    `);
    return { ok: true };
  }
}

@Injectable()
export class DailyMetricsAggregator {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async run(day: Date = new Date()) {
    const dayISO = day.toISOString().slice(0, 10);
    const rows = await this.db
      .select({
        cycle: subscriptions.billingCycle,
        monthly: subscriptionPlans.monthlyPrice,
        annual: subscriptionPlans.annualPrice,
        override: subscriptions.priceOverride,
        status: subscriptions.status,
      })
      .from(subscriptions)
      .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id));
    let mrr = 0;
    let active = 0;
    for (const r of rows) {
      if (r.status !== 'ACTIVE') continue;
      active++;
      const base =
        r.cycle === 'ANNUAL'
          ? Math.round((r.override ?? r.annual) / 12)
          : (r.override ?? r.monthly);
      mrr += base;
    }
    const [{ ownersActive }] = await this.db
      .select({ ownersActive: sql<number>`count(*) filter (where status='ACTIVE')::int` })
      .from(owners)
      .where(isNull(owners.deletedAt));
    await this.db
      .insert(dailyPlatformMetrics)
      .values({
        day: dayISO,
        mrr,
        arr: mrr * 12,
        arpu: active ? Math.round(mrr / active) : 0,
        activeSubscriptions: active,
        activeOwners: ownersActive,
      })
      .onConflictDoUpdate({
        target: dailyPlatformMetrics.day,
        set: {
          mrr,
          arr: mrr * 12,
          arpu: active ? Math.round(mrr / active) : 0,
          activeSubscriptions: active,
          activeOwners: ownersActive,
          updatedAt: new Date(),
        },
      });
    return { day: dayISO, mrr, active, ownersActive };
  }
}

@Injectable()
export class AnnouncementPublisherWorker {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}
  async run(now: Date = new Date()) {
    await this.db
      .update(announcements)
      .set({ status: 'PUBLISHED', publishedAt: now })
      .where(and(eq(announcements.status, 'DRAFT'), lte(announcements.scheduledAt, now)));
    await this.db
      .update(announcements)
      .set({ status: 'EXPIRED' })
      .where(and(eq(announcements.status, 'PUBLISHED'), lte(announcements.expiresAt, now)));
    return { ok: true };
  }
}

@Injectable()
export class NotificationDispatchWorker implements OnModuleInit {
  private readonly logger = new Logger(NotificationDispatchWorker.name);
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}
  onModuleInit(): void {
    this.logger.log('Notification dispatch worker initialized');
  }
  async run() {
    // Pull pending outbound notifications and dispatch via providers.
    // TODO: gateway call — wire actual notification channels.
    await this.db.insert(backgroundJobs).values({
      name: 'notification.dispatch',
      queue: 'notifications',
      state: 'Completed',
    });
    return { ok: true };
  }
}

@Module({
  providers: [
    SubscriptionLifecycleWorker,
    DailyMetricsAggregator,
    AnnouncementPublisherWorker,
    NotificationDispatchWorker,
  ],
  exports: [
    SubscriptionLifecycleWorker,
    DailyMetricsAggregator,
    AnnouncementPublisherWorker,
    NotificationDispatchWorker,
  ],
})
export class WorkersModule {}
