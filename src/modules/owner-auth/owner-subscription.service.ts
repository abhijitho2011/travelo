import { Inject, Injectable, Optional } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { invoices, properties, subscriptionPlans, subscriptions } from '../../database/schema';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { StorageService } from '../storage/storage.service';
import { OwnerErrors } from './owner-errors';
import { OwnerPortalService } from './owner-portal.service';

/** Owner-facing invoice links are short-lived; the list can always be refetched. */
const INVOICE_URL_TTL_SECONDS = 900;

/**
 * Read-only subscription view for the owner app. Owners cannot self-upgrade —
 * plan changes are an admin action — so there is deliberately no write path
 * here.
 */
@Injectable()
export class OwnerSubscriptionService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly entitlements: EntitlementsService,
    /**
     * Optional so the existing unit tests can construct this service without a
     * store. When absent, invoices simply carry no `documentUrl` — the rest of
     * the row is unaffected.
     */
    @Optional() private readonly storage?: StorageService,
  ) {}

  /** Whole days left in the current period, floored at 0 once it has lapsed. */
  static daysRemaining(periodEnd: Date, now: Date = new Date()): number {
    const ms = periodEnd.getTime() - now.getTime();
    if (ms <= 0) return 0;
    return Math.ceil(ms / 86_400_000);
  }

  async current(ownerId: string) {
    const [row] = await this.db
      .select({ s: subscriptions, p: subscriptionPlans })
      .from(subscriptions)
      .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
      .where(eq(subscriptions.ownerId, ownerId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    if (!row) throw OwnerErrors.subscriptionNotFound();

    // Usage counts LIVE properties only — an archived or soft-deleted hotel
    // must not keep consuming the allowance.
    const [used] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(properties)
      .where(and(eq(properties.ownerId, ownerId), isNull(properties.deletedAt)));

    // Effective entitlements = plan features with the owner's admin-granted
    // overrides applied. Same resolver the admin console reads.
    const resolved = await this.entitlements.resolve(ownerId);

    const monthlyPrice = row.p.monthlyPrice;
    return {
      id: row.s.id,
      planName: row.p.name,
      description: row.p.description,
      status: row.s.status,
      billingCycle: row.s.billingCycle,
      durationMonths: row.p.durationMonths,
      monthlyPrice,
      // The period total is always monthly x duration — monthlyPrice is the
      // single source of truth for plan pricing.
      periodPrice: monthlyPrice * row.p.durationMonths,
      currency: row.p.currency,
      currentPeriodStart: row.s.currentPeriodStart,
      currentPeriodEnd: row.s.currentPeriodEnd,
      daysRemaining: OwnerSubscriptionService.daysRemaining(row.s.currentPeriodEnd),
      autoRenew: row.s.autoRenew,
      propertyLimit: OwnerPortalService.effectivePropertyLimit(
        row.p.propertyLimit,
        row.s.propertyLimitOverride,
      ),
      propertiesUsed: used?.count ?? 0,
      features: resolved.effective,
    };
  }

  async invoices(ownerId: string, params: { limit?: number; offset?: number }) {
    const limit = Math.min(params.limit ?? 25, 100);
    const offset = params.offset ?? 0;
    const rows = await this.db
      .select()
      .from(invoices)
      .where(eq(invoices.ownerId, ownerId))
      .orderBy(desc(invoices.createdAt))
      .limit(limit)
      .offset(offset);
    const [total] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(invoices)
      .where(eq(invoices.ownerId, ownerId));
    return {
      items: await Promise.all(rows.map((i) => this.serializeInvoice(i))),
      total: total?.count ?? 0,
      limit,
      offset,
    };
  }

  /**
   * One owner-visible invoice row.
   *
   * `documentUrl` is a presigned, 15-minute link and appears ONLY when a PDF
   * has actually been generated. `storageKey` itself never leaves the API — the
   * owner gets a link, not the internal object layout.
   */
  private async serializeInvoice(i: typeof invoices.$inferSelect) {
    const documentUrl =
      i.storageKey && this.storage
        ? await this.storage.getSignedUrl(i.storageKey, INVOICE_URL_TTL_SECONDS)
        : undefined;
    return {
      id: i.id,
      invoiceNumber: i.invoiceNumber,
      billingPeriodStart: i.billingPeriodStart,
      billingPeriodEnd: i.billingPeriodEnd,
      subtotal: i.subtotal,
      tax: i.tax,
      discount: i.discount,
      total: i.total,
      currency: i.currency,
      status: i.status,
      issuedAt: i.issuedAt,
      dueDate: i.dueDate,
      paidAt: i.paidAt,
      ...(documentUrl ? { documentUrl, documentUrlExpiresInSeconds: INVOICE_URL_TTL_SECONDS } : {}),
    };
  }
}
