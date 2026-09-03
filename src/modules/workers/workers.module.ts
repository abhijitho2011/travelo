import { Inject, Injectable, Logger, Module, OnModuleInit } from '@nestjs/common';
import { and, eq, isNull, lte, sql, type SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { loadEnv } from '../../config/env';
import {
  announcements,
  backgroundJobs,
  dailyPlatformMetrics,
  owners,
  properties,
  propertyDailySnapshots,
  reservations,
  rooms,
  subscriptionPlans,
  subscriptions,
} from '../../database/schema';
import { ChannexSyncService } from '../integrations/channex-sync.service';
import { IntegrationsModule } from '../integrations/integrations.module';
import { NotificationsModule } from '../notifications/notifications.module';
import { BillingModule } from '../billing/billing.module';
import { BillingService } from '../billing/billing.service';
import {
  NotificationDeliveryService,
  type NotifyTarget,
} from '../notifications/notification-delivery.service';
import { inAppRecipient } from '../notifications/channels/channel.interface';
import { Cron, CronExpression } from '@nestjs/schedule';
import { JwtModule } from '@nestjs/jwt';
import { SharedAuthModule } from '../shared-auth/shared-auth.module';
import { AuditModule } from '../audit/audit.module';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import { StaffPermissionsGuard } from '../staff-auth/staff-permissions.guard';
import { StaffNightAuditController } from './staff-night-audit.controller';

@Injectable()
export class SubscriptionLifecycleWorker {
  private readonly logger = new Logger(SubscriptionLifecycleWorker.name);
  /** Days before expiry at which an owner is warned. */
  static readonly EXPIRY_WARNING_DAYS = [30, 7, 3] as const;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notifications: NotificationDeliveryService,
  ) {}

  /**
   * Marks:
   *  ACTIVE -> EXPIRING when now >= currentPeriodEnd - 7 days
   *  EXPIRING -> EXPIRED when now >= currentPeriodEnd
   *  EXPIRED -> GRACE_PERIOD when now < currentPeriodEnd + 7 days
   *  GRACE_PERIOD -> SUSPENDED when now >= currentPeriodEnd + 14 days
   */
  async run(now: Date = new Date()) {
    // TRIALS. Previously the DEFAULT status was TRIAL and the lifecycle never
    // touched it, so a trial lived forever. Capture the trials lapsing THIS run
    // before flipping them (so their origin is still known for the "trial
    // ended" note), then expire them. A trial that is paid for converts to
    // ACTIVE via settlement, so it never reaches here.
    const expiredTrials = await this.audience(
      sql`s.status='TRIAL' AND s.current_period_end <= ${now}::timestamptz`,
    );
    await this.db.execute(sql`
      UPDATE subscriptions
      SET status='EXPIRED', updated_at=now()
      WHERE status='TRIAL' AND current_period_end <= ${now}::timestamptz
    `);

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
    // Only a subscription that has EVER been paid earns a grace period. A
    // never-paid trial that just expired stays EXPIRED — it does not get 14 more
    // days of access dressed up as grace.
    await this.db.execute(sql`
      UPDATE subscriptions
      SET status='GRACE_PERIOD', updated_at=now()
      WHERE status='EXPIRED' AND current_period_end > ${new Date(now.getTime() - 7 * 86400_000)}::timestamptz
        AND EXISTS (
          SELECT 1 FROM payments pay
          WHERE pay.subscription_id = subscriptions.id AND pay.status = 'SUCCESS'
        )
    `);
    await this.db.execute(sql`
      UPDATE subscriptions
      SET status='SUSPENDED', updated_at=now()
      WHERE status='GRACE_PERIOD' AND current_period_end <= ${new Date(now.getTime() - 14 * 86400_000)}::timestamptz
    `);

    // Telling the owner is strictly downstream of the state machine above:
    // it runs after every UPDATE has landed and can only log on failure.
    await this.announce(now, expiredTrials);
    return { ok: true };
  }

  /**
   * Emits the lifecycle notifications. Deliberately re-derives its audience
   * from the CURRENT state rather than from the UPDATE results, so a run that
   * crashed halfway through last night still catches up — `notifyOnceQuietly`
   * is what stops that from becoming a daily repeat.
   */
  private async announce(now: Date, expiredTrials: LifecycleRecipient[] = []): Promise<void> {
    try {
      // Trials about to end (reminders), then the ones that ended this run.
      for (const days of [3, 1]) {
        const from = new Date(now.getTime() + (days - 1) * 86400_000);
        const to = new Date(now.getTime() + days * 86400_000);
        const rows = await this.audience(
          sql`s.status='TRIAL'
              AND s.current_period_end > ${from}::timestamptz
              AND s.current_period_end <= ${to}::timestamptz`,
        );
        for (const r of rows) {
          await this.notifications.notifyOnceQuietly({
            key: 'subscription.trial_ending',
            relatedType: `subscription.trial_ending.${days}`,
            relatedId: r.subscriptionId,
            targets: this.ownerTargets(r),
            vars: { ...this.ownerVars(r), days },
          });
        }
      }
      for (const r of expiredTrials) {
        await this.notifications.notifyOnceQuietly({
          key: 'subscription.trial_expired',
          relatedType: 'subscription.trial_expired',
          relatedId: r.subscriptionId,
          targets: this.ownerTargets(r),
          vars: this.ownerVars(r),
        });
      }

      for (const days of SubscriptionLifecycleWorker.EXPIRY_WARNING_DAYS) {
        const from = new Date(now.getTime() + (days - 1) * 86400_000);
        const to = new Date(now.getTime() + days * 86400_000);
        const rows = await this.audience(
          sql`s.status IN ('ACTIVE','EXPIRING')
              AND s.current_period_end > ${from}::timestamptz
              AND s.current_period_end <= ${to}::timestamptz`,
        );
        for (const r of rows) {
          await this.notifications.notifyOnceQuietly({
            key: 'subscription.expiring',
            relatedType: `subscription.expiring.${days}`,
            relatedId: r.subscriptionId,
            targets: this.ownerTargets(r),
            vars: { ...this.ownerVars(r), days },
          });
        }
      }

      const transitions: Array<{ status: string; key: string }> = [
        { status: 'EXPIRED', key: 'subscription.expired' },
        { status: 'GRACE_PERIOD', key: 'subscription.grace_started' },
        { status: 'SUSPENDED', key: 'subscription.suspended' },
      ];
      for (const t of transitions) {
        const rows = await this.audience(sql`s.status = ${t.status}`);
        for (const r of rows) {
          await this.notifications.notifyOnceQuietly({
            key: t.key,
            relatedType: t.key,
            relatedId: r.subscriptionId,
            targets: this.ownerTargets(r),
            vars: this.ownerVars(r),
          });
        }
      }
    } catch (err) {
      // A notification problem must never make the lifecycle run look failed.
      this.logger.error(`Lifecycle notifications failed: ${(err as Error).message}`);
    }
  }

  private async audience(predicate: SQL): Promise<LifecycleRecipient[]> {
    const res = await this.db.execute(sql`
      SELECT s.id            AS subscription_id,
             s.owner_id      AS owner_id,
             s.current_period_end AS period_end,
             o.name          AS owner_name,
             o.email         AS owner_email,
             p.name          AS plan_name,
             (SELECT pr.name FROM properties pr
               WHERE pr.owner_id = s.owner_id AND pr.deleted_at IS NULL
               ORDER BY pr.created_at LIMIT 1) AS property_name
        FROM subscriptions s
        JOIN owners o ON o.id = s.owner_id
        JOIN subscription_plans p ON p.id = s.plan_id
       WHERE o.deleted_at IS NULL AND ${predicate}
    `);
    return ((res as unknown as { rows?: Record<string, unknown>[] }).rows ?? []).map((r) => ({
      subscriptionId: String(r.subscription_id),
      ownerId: String(r.owner_id),
      ownerName: (r.owner_name as string) ?? 'there',
      ownerEmail: (r.owner_email as string) ?? '',
      planName: (r.plan_name as string) ?? 'Tavelo',
      propertyName: (r.property_name as string) ?? 'your property',
      periodEnd: r.period_end ? new Date(r.period_end as string) : null,
    }));
  }

  private ownerTargets(r: LifecycleRecipient): NotifyTarget[] {
    return [
      { channel: 'EMAIL' as const, to: r.ownerEmail },
      { channel: 'IN_APP' as const, to: inAppRecipient('owner', r.ownerId) },
    ].filter((t) => t.to);
  }

  private ownerVars(r: LifecycleRecipient): Record<string, unknown> {
    const end = r.periodEnd;
    return {
      ownerName: r.ownerName,
      planName: r.planName,
      propertyName: r.propertyName,
      expiryDate: end ? end.toISOString().slice(0, 10) : null,
      graceEndsOn: end ? new Date(end.getTime() + 14 * 86400_000).toISOString().slice(0, 10) : null,
    };
  }
}

interface LifecycleRecipient {
  subscriptionId: string;
  ownerId: string;
  ownerName: string;
  ownerEmail: string;
  planName: string;
  propertyName: string;
  periodEnd: Date | null;
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
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly deliveries: NotificationDeliveryService,
  ) {}
  onModuleInit(): void {
    this.logger.log('Notification dispatch worker initialized');
  }

  /**
   * Drains the due PENDING deliveries. `drain` is per-row try/catch, so a
   * provider outage costs those rows an attempt and nothing else — and the
   * outer catch here means even a database hiccup cannot kill the worker loop.
   */
  async run(limit = 100) {
    let stats = { processed: 0, sent: 0, failed: 0, skipped: 0, retried: 0 };
    let state = 'Completed';
    let error: string | null = null;
    try {
      stats = await this.deliveries.drain(limit);
    } catch (err) {
      state = 'Failed';
      error = ((err as Error)?.message ?? String(err)).slice(0, 2000);
      this.logger.error(`Notification dispatch run failed: ${error}`);
    }
    try {
      await this.db.insert(backgroundJobs).values({
        name: 'notification.dispatch',
        queue: 'notifications',
        state,
        error,
      });
    } catch (err) {
      this.logger.warn(`Could not record notification.dispatch job row: ${(err as Error).message}`);
    }
    return { ok: state === 'Completed', ...stats };
  }
}

/**
 * Polls Channex for every live connection, on a schedule.
 *
 * Two things make it safe to leave running everywhere: it is INERT while
 * CHANNEX_ENABLED is false (no query, no socket, one debug line), and ONE
 * connection failing cannot abort the others — each is caught individually, so
 * a hotel with a revoked API key does not stop every other hotel from syncing.
 */
@Injectable()
export class ChannexSyncWorker {
  private readonly logger = new Logger(ChannexSyncWorker.name);
  /** Channels expect inventory freshness in minutes, not hours. */
  static readonly INTERVAL_MS = 15 * 60 * 1000;

  constructor(private readonly channex: ChannexSyncService) {}

  async run(): Promise<{ ran: boolean; ok: number; failed: number }> {
    if (!this.channex.configured) {
      this.logger.debug('Channex not configured — sync worker is inert');
      return { ran: false, ok: 0, failed: 0 };
    }
    const connections = await this.channex.activeConnections();
    let ok = 0;
    let failed = 0;
    for (const connection of connections) {
      try {
        const outcome = await this.channex.syncConnection(connection.id);
        if (outcome.ok) ok += 1;
        else failed += 1;
      } catch (err) {
        // Swallowed on purpose: the connection's own health row and sync log
        // already carry the reason, and the next connection must still run.
        failed += 1;
        this.logger.warn(
          `Channex sync failed for connection ${connection.id}: ${(err as Error).message}`,
        );
      }
    }
    return { ran: true, ok, failed };
  }
}

/**
 * Actually runs the workers.
 *
 * Every worker class existed and was unit-tested, but nothing ever called
 * `run()` — there was no scheduler, no cron and no queue processor anywhere in
 * the app. So subscriptions never expired, `daily_platform_metrics` stayed
 * empty, scheduled announcements never published, queued notifications were
 * never delivered, and Channex never synced. All of it was dead code.
 *
 * Two guards make it safe to schedule aggressively:
 *
 *  - **No overlap.** Each tick is skipped while the previous one is still
 *    running. A slow notification drain must not start a second drain that
 *    sends the same rows twice.
 *  - **No crash.** A worker that throws is logged and swallowed. One failing
 *    worker must never stop the timer that drives all the others.
 */
/**
 * The night audit — the property PMS end-of-day close (Phase 4, item 4.1).
 *
 * Two jobs, both idempotent so a re-run (or a boot that missed midnight) is
 * safe:
 *   1. AUTO NO-SHOW. A CONFIRMED booking whose arrival date has passed and that
 *      never checked in is marked NO_SHOW, so it stops holding capacity.
 *   2. DAILY SNAPSHOT. One row per (property, business date) with arrivals,
 *      departures, in-house, occupancy and no-shows — the history the on-the-fly
 *      desk figures could never keep.
 */
@Injectable()
export class NightAuditWorker {
  private readonly logger = new Logger(NightAuditWorker.name);
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  private static isoDate(d: Date): string {
    return d.toISOString().slice(0, 10);
  }

  /** CONFIRMED with an arrival date strictly before today → NO_SHOW. */
  async autoNoShow(now: Date = new Date()): Promise<number> {
    const today = NightAuditWorker.isoDate(now);
    const res = await this.db.execute(sql`
      UPDATE reservations
      SET status='NO_SHOW', updated_at=now()
      WHERE status='CONFIRMED' AND check_in < ${today}::date AND deleted_at IS NULL
    `);
    const count = (res as unknown as { rowCount?: number }).rowCount ?? 0;
    if (count > 0) this.logger.log(`Night audit marked ${count} booking(s) NO_SHOW`);
    return count;
  }

  /**
   * Writes the snapshot for one business date (default: the day that just
   * ended). Occupancy is rooms in-house over rooms not out of service.
   */
  async snapshot(now: Date = new Date()): Promise<number> {
    // The business date is the day that closed — yesterday relative to a
    // just-after-midnight run.
    const date = NightAuditWorker.isoDate(new Date(now.getTime() - 12 * 3600_000));
    const props = await this.db
      .select({ id: properties.id })
      .from(properties)
      .where(isNull(properties.deletedAt));

    for (const p of props) {
      const [row] = await this.db
        .execute(
          sql`
        SELECT
          (SELECT count(*) FROM reservations r WHERE r.property_id = ${p.id}
             AND r.check_in = ${date}::date AND r.status IN ('CHECKED_IN','CHECKED_OUT'))::int AS arrivals,
          (SELECT count(*) FROM reservations r WHERE r.property_id = ${p.id}
             AND r.check_out = ${date}::date AND r.status = 'CHECKED_OUT')::int AS departures,
          (SELECT count(*) FROM reservations r WHERE r.property_id = ${p.id}
             AND r.check_in <= ${date}::date AND r.check_out > ${date}::date
             AND r.status = 'CHECKED_IN')::int AS in_house,
          (SELECT count(*) FROM rooms rm WHERE rm.property_id = ${p.id}
             AND rm.deleted_at IS NULL AND rm.status <> 'OUT_OF_ORDER')::int AS rooms_available,
          (SELECT count(*) FROM reservations r WHERE r.property_id = ${p.id}
             AND r.check_in = ${date}::date AND r.status = 'NO_SHOW')::int AS no_shows,
          (SELECT coalesce(sum(r.rate_paise),0) FROM reservations r WHERE r.property_id = ${p.id}
             AND r.check_in <= ${date}::date AND r.check_out > ${date}::date
             AND r.status IN ('CHECKED_IN','CHECKED_OUT'))::int AS revenue_paise
      `,
        )
        .then((x) => (x as unknown as { rows: Record<string, number>[] }).rows);

      const arrivals = row?.arrivals ?? 0;
      const departures = row?.departures ?? 0;
      const inHouse = row?.in_house ?? 0;
      const roomsAvailable = row?.rooms_available ?? 0;
      const noShows = row?.no_shows ?? 0;
      const revenuePaise = row?.revenue_paise ?? 0;
      const occupancyPct = roomsAvailable > 0 ? Math.round((inHouse / roomsAvailable) * 100) : 0;

      await this.db
        .insert(propertyDailySnapshots)
        .values({
          propertyId: p.id,
          businessDate: date,
          arrivals,
          departures,
          inHouse,
          roomsAvailable,
          roomsSold: inHouse,
          occupancyPct,
          noShows,
          revenuePaise,
        })
        .onConflictDoUpdate({
          target: [propertyDailySnapshots.propertyId, propertyDailySnapshots.businessDate],
          set: {
            arrivals,
            departures,
            inHouse,
            roomsAvailable,
            roomsSold: inHouse,
            occupancyPct,
            noShows,
            revenuePaise,
          },
        });
    }
    return props.length;
  }

  async run(now: Date = new Date()): Promise<{ ok: boolean; noShows: number; snapshots: number }> {
    const noShows = await this.autoNoShow(now);
    const snapshots = await this.snapshot(now);
    return { ok: true, noShows, snapshots };
  }
}

@Injectable()
/**
 * Data retention. Two append-only tables grow forever without pruning:
 * `audit_logs` and `notification_deliveries`. This trims rows older than their
 * configured window (AUDIT_RETENTION_DAYS / DELIVERY_RETENTION_DAYS) once a day.
 *
 * Only SETTLED deliveries are pruned — a PENDING row is still owed a send, so it
 * is spared regardless of age. Audit rows are pruned purely by age (they are
 * terminal by nature). A window of 0 disables pruning for that table, so a
 * deployment with a compliance hold simply sets it to 0.
 */
@Injectable()
/**
 * Expires enquiry holds. A PENDING booking with `hold_expires_at` in the past
 * becomes CANCELLED — it never blocked a room, but it did sit in the
 * unassigned queue and on the guest's mind. One statement, so a large backlog
 * after downtime clears in a single pass.
 */
@Injectable()
export class HoldExpiryWorker {
  private readonly logger = new Logger(HoldExpiryWorker.name);
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async run(now: Date = new Date()): Promise<{ expired: number }> {
    const res = await this.db.execute(sql`
      UPDATE reservations
      SET status='CANCELLED', cancelled_at=${now}, updated_at=${now}
      WHERE status='PENDING' AND hold_expires_at IS NOT NULL AND hold_expires_at < ${now}
        AND deleted_at IS NULL
    `);
    const expired = Number((res as { rowCount?: number }).rowCount ?? 0);
    if (expired) this.logger.log(`Expired ${expired} unpaid hold(s)`);
    return { expired };
  }
}

export class RetentionWorker {
  private readonly logger = new Logger(RetentionWorker.name);
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async run(): Promise<{ audit: number; deliveries: number }> {
    const env = loadEnv();
    const audit = await this.pruneAudit(env.AUDIT_RETENTION_DAYS);
    const deliveries = await this.pruneDeliveries(env.DELIVERY_RETENTION_DAYS);
    return { audit, deliveries };
  }

  private async pruneAudit(days: number): Promise<number> {
    if (days <= 0) return 0;
    const res = await this.db.execute(sql`
      DELETE FROM audit_logs WHERE created_at < now() - ${`${days} days`}::interval
    `);
    const count = (res as unknown as { rowCount?: number }).rowCount ?? 0;
    if (count > 0) this.logger.log(`Pruned ${count} audit_logs row(s) older than ${days}d`);
    return count;
  }

  private async pruneDeliveries(days: number): Promise<number> {
    if (days <= 0) return 0;
    const res = await this.db.execute(sql`
      DELETE FROM notification_deliveries
       WHERE created_at < now() - ${`${days} days`}::interval
         AND status IN ('SENT','FAILED','SKIPPED')
    `);
    const count = (res as unknown as { rowCount?: number }).rowCount ?? 0;
    if (count > 0)
      this.logger.log(`Pruned ${count} settled notification_deliveries row(s) older than ${days}d`);
    return count;
  }
}

export class WorkerSchedulerService {
  private readonly logger = new Logger(WorkerSchedulerService.name);
  private readonly running = new Set<string>();

  constructor(
    private readonly lifecycle: SubscriptionLifecycleWorker,
    private readonly metrics: DailyMetricsAggregator,
    private readonly announcements: AnnouncementPublisherWorker,
    private readonly notifications: NotificationDispatchWorker,
    private readonly channex: ChannexSyncWorker,
    private readonly billing: BillingService,
    private readonly nightAudit: NightAuditWorker,
    private readonly retention: RetentionWorker,
    private readonly holds: HoldExpiryWorker,
  ) {}

  /** Unpaid enquiry holds lapse on the minute they said they would. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  expireHolds(): Promise<void> {
    return this.guard('hold-expiry', () => this.holds.run());
  }

  /** Queued notifications are user-visible, so they drain often. */
  @Cron(CronExpression.EVERY_MINUTE)
  dispatchNotifications(): Promise<void> {
    return this.guard('notifications', () => this.notifications.run());
  }

  /** Scheduled announcements should appear close to their stated time. */
  @Cron(CronExpression.EVERY_5_MINUTES)
  publishAnnouncements(): Promise<void> {
    return this.guard('announcements', () => this.announcements.run());
  }

  /** Channels expect inventory freshness in minutes. Inert unless configured. */
  @Cron(CronExpression.EVERY_10_MINUTES)
  syncChannex(): Promise<void> {
    return this.guard('channex', () => this.channex.run());
  }

  /**
   * Retries refunds that are still PENDING because the gateway call failed at
   * refund time (item 1.7). Without this a transient gateway blip would strand
   * a refund forever, with the admin told it was "in progress".
   */
  @Cron(CronExpression.EVERY_10_MINUTES)
  retryRefunds(): Promise<void> {
    return this.guard('refund-retry', () => this.billing.retryPendingRefunds());
  }

  /**
   * Subscription state changes by the day, not the minute, but running hourly
   * means a boot at any hour still catches up rather than waiting for midnight.
   */
  @Cron(CronExpression.EVERY_HOUR)
  advanceSubscriptions(): Promise<void> {
    return this.guard('subscriptions', () => this.lifecycle.run());
  }

  /** Yesterday's numbers, computed once the day is safely over. */
  /** The property end-of-day close, just after the platform metrics roll. */
  @Cron('30 0 * * *')
  runNightAudit(): Promise<void> {
    return this.guard('night-audit', () => this.nightAudit.run());
  }

  @Cron('15 0 * * *')
  aggregateDailyMetrics(): Promise<void> {
    return this.guard('metrics', () => this.metrics.run());
  }

  /** Trim append-only audit + delivery history past its retention window. */
  @Cron('45 3 * * *')
  pruneRetention(): Promise<void> {
    return this.guard('retention', () => this.retention.run());
  }

  private async guard(name: string, run: () => Promise<unknown>): Promise<void> {
    if (this.running.has(name)) {
      this.logger.warn(`Skipping ${name}: the previous run has not finished`);
      return;
    }
    this.running.add(name);
    try {
      await run();
    } catch (err) {
      this.logger.error(`Worker ${name} failed: ${(err as Error).message}`);
    } finally {
      this.running.delete(name);
    }
  }
}

@Module({
  imports: [
    IntegrationsModule,
    NotificationsModule,
    BillingModule,
    JwtModule.register({}),
    SharedAuthModule,
    AuditModule,
  ],
  controllers: [StaffNightAuditController],
  providers: [
    StaffJwtGuard,
    StaffPermissionsGuard,
    WorkerSchedulerService,
    ChannexSyncWorker,
    SubscriptionLifecycleWorker,
    DailyMetricsAggregator,
    AnnouncementPublisherWorker,
    NotificationDispatchWorker,
    NightAuditWorker,
    RetentionWorker,
    HoldExpiryWorker,
  ],
  exports: [
    ChannexSyncWorker,
    SubscriptionLifecycleWorker,
    DailyMetricsAggregator,
    AnnouncementPublisherWorker,
    NotificationDispatchWorker,
    NightAuditWorker,
    RetentionWorker,
    HoldExpiryWorker,
  ],
})
export class WorkersModule {}
