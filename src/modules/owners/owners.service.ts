import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, ilike, isNull, ne, notInArray, or, sql, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  locationDistricts,
  locationStates,
  owners,
  properties,
  subscriptionEvents,
  subscriptions,
  supportTickets,
  subscriptionPlans,
  OwnerStatus,
  SubscriptionStatus,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { getRequestContext } from '../../common/context/request-context';
import { addMonths } from '../../common/date/add-months';
import { normalizeMobile } from '../shared-auth/mobile.util';
import { CreateOwnerDto, GSTIN_PATTERN, OwnerFilterDto, UpdateOwnerDto } from './dto';

/** Statuses a subscription can never move out of — nothing to cancel. */
const TERMINAL_SUBSCRIPTION_STATUSES: SubscriptionStatus[] = ['CANCELLED', 'EXPIRED'];

/**
 * Uses the same normaliser as the auth code so `+91 98950 77492`, `09895077492`
 * and `9895077492` all store identically, then insists on a real 10-digit
 * Indian mobile (leading 6-9).
 */
function normalizeIndianMobile(raw: string): string {
  const normalized = normalizeMobile(raw);
  if (!normalized || !/^[6-9]\d{9}$/.test(normalized)) {
    throw new BadRequestException({
      error: 'INVALID_PHONE',
      message: 'phone must be a valid 10-digit Indian mobile number',
    });
  }
  return normalized;
}

/** Empty GST is stored as NULL, never as an empty string. */
function normalizeGstin(raw: string | undefined): string | null {
  const trimmed = raw?.trim().toUpperCase();
  if (!trimmed) return null;
  if (!GSTIN_PATTERN.test(trimmed)) {
    throw new BadRequestException({
      error: 'INVALID_GSTIN',
      message: 'gstNumber must be a valid 15-character GSTIN',
    });
  }
  return trimmed;
}

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

  /**
   * Creates an owner AND its subscription in one transaction. There is no code
   * path that inserts an owner row on its own, and any failure after the owner
   * insert rolls the whole thing back — a subscription-less owner cannot exist.
   */
  async create(dto: CreateOwnerDto) {
    if (!dto.planId) {
      throw new BadRequestException({
        error: 'PLAN_REQUIRED',
        message: 'A subscription plan is required to create an owner',
      });
    }
    const planId = dto.planId;
    const ctx = getRequestContext();
    const email = dto.email.toLowerCase();
    const mobile = normalizeIndianMobile(dto.phone);
    const gstNumber = normalizeGstin(dto.gstNumber);

    const created = await this.db.transaction(async (tx) => {
      // The state/district pair must come from the admin-managed catalogue, and
      // the district must actually sit under the chosen state.
      const [stateRow] = await tx
        .select({ id: locationStates.id, name: locationStates.name })
        .from(locationStates)
        .where(eq(locationStates.id, dto.state))
        .limit(1);
      if (!stateRow) {
        throw new BadRequestException({
          error: 'INVALID_LOCATION',
          message: 'Unknown state — pick one from Settings → Locations',
        });
      }
      const [districtRow] = await tx
        .select({ id: locationDistricts.id, name: locationDistricts.name })
        .from(locationDistricts)
        .where(
          and(eq(locationDistricts.id, dto.district), eq(locationDistricts.stateId, stateRow.id)),
        )
        .limit(1);
      if (!districtRow) {
        throw new BadRequestException({
          error: 'INVALID_LOCATION',
          message: `District does not belong to ${stateRow.name}`,
        });
      }

      // Only a live owner blocks the email. A soft-deleted owner keeps its row
      // for billing/audit history but must not reserve the address forever, so
      // the same email can be used to create a fresh owner after deletion.
      const existing = await tx
        .select({ id: owners.id })
        .from(owners)
        .where(and(eq(owners.email, email), isNull(owners.deletedAt)))
        .limit(1);
      if (existing.length) throw new ConflictException('Owner email already exists');

      const [plan] = await tx
        .select()
        .from(subscriptionPlans)
        .where(eq(subscriptionPlans.id, planId))
        .limit(1);
      if (!plan) {
        throw new NotFoundException({
          error: 'PLAN_NOT_FOUND',
          message: `Subscription plan ${planId} does not exist`,
        });
      }
      if (plan.status !== 'ACTIVE') {
        throw new BadRequestException({
          error: 'PLAN_INACTIVE',
          message: `Subscription plan "${plan.name}" is archived and cannot be assigned`,
        });
      }

      const startsAt = dto.startsAt ? new Date(dto.startsAt) : new Date();
      const periodEnd = addMonths(startsAt, plan.durationMonths);

      const [owner] = await tx
        .insert(owners)
        .values({
          name: dto.name,
          email,
          phone: mobile,
          mobile,
          company: dto.company,
          gstNumber,
          // Keep the flat columns consistent with the JSONB block.
          city: districtRow.name,
          country: dto.country ?? 'India',
          stateId: stateRow.id,
          districtId: districtRow.id,
          pinCode: dto.pinCode,
          address: {
            line1: dto.address,
            pinCode: dto.pinCode,
            state: stateRow.name,
            stateId: stateRow.id,
            district: districtRow.name,
            districtId: districtRow.id,
            country: dto.country ?? 'India',
          } as never,
          createdBy: ctx?.adminId,
          status: 'PENDING',
        })
        .returning();

      const [subscription] = await tx
        .insert(subscriptions)
        .values({
          ownerId: owner.id,
          planId: plan.id,
          status: 'ACTIVE',
          billingCycle: plan.durationMonths % 12 === 0 ? 'ANNUAL' : 'MONTHLY',
          startsAt,
          currentPeriodStart: startsAt,
          currentPeriodEnd: periodEnd,
        })
        .returning();

      await tx.insert(subscriptionEvents).values({
        subscriptionId: subscription.id,
        type: 'created',
        actorAdminId: ctx?.adminId,
        payload: {
          cause: 'owner.created',
          planId: plan.id,
          planName: plan.name,
          durationMonths: plan.durationMonths,
          periodPrice: plan.monthlyPrice * plan.durationMonths,
          currentPeriodStart: startsAt,
          currentPeriodEnd: periodEnd,
        },
      });

      await this.audit.record({
        action: 'owner.created',
        entity: 'owner',
        entityId: owner.id,
        after: { owner, subscription },
      });

      return { owner, subscription, plan };
    });

    return {
      ...this.serialize(created.owner),
      subscription: {
        id: created.subscription.id,
        planId: created.plan.id,
        plan: created.plan.name,
        status: created.subscription.status,
        durationMonths: created.plan.durationMonths,
        periodPrice: created.plan.monthlyPrice * created.plan.durationMonths,
        currentPeriodStart: created.subscription.currentPeriodStart,
        currentPeriodEnd: created.subscription.currentPeriodEnd,
      },
    };
  }

  /**
   * Soft-deletes an owner. Billing and audit history must survive, so nothing is
   * hard-deleted: the owner is stamped with `deleted_at`, any live subscription
   * is cancelled and every property is archived — all in one transaction.
   */
  async remove(id: string, reason?: string) {
    const before = await this.get(id); // 404s if already deleted
    const ctx = getRequestContext();
    const now = new Date();

    const result = await this.db.transaction(async (tx) => {
      const [owner] = await tx
        .update(owners)
        .set({ deletedAt: now, updatedAt: now })
        .where(and(eq(owners.id, id), isNull(owners.deletedAt)))
        .returning();
      if (!owner) throw new NotFoundException('Owner not found');

      const liveSubs = await tx
        .select({ id: subscriptions.id, status: subscriptions.status })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.ownerId, id),
            notInArray(subscriptions.status, TERMINAL_SUBSCRIPTION_STATUSES),
          ),
        );
      for (const sub of liveSubs) {
        await tx
          .update(subscriptions)
          .set({ status: 'CANCELLED', cancelAt: now, autoRenew: false, updatedAt: now })
          .where(eq(subscriptions.id, sub.id));
        await tx.insert(subscriptionEvents).values({
          subscriptionId: sub.id,
          type: 'status.cancelled',
          actorAdminId: ctx?.adminId,
          payload: {
            cause: 'owner.deleted',
            previousStatus: sub.status,
            reason: reason ?? 'Owner deleted from the platform',
          },
        });
      }

      const archived = await tx
        .update(properties)
        .set({ status: 'ARCHIVED', updatedAt: now })
        .where(and(eq(properties.ownerId, id), ne(properties.status, 'ARCHIVED')))
        .returning({ id: properties.id });

      await this.audit.record({
        action: 'owner.deleted',
        entity: 'owner',
        entityId: id,
        before,
        after: {
          deletedAt: now,
          cancelledSubscriptions: liveSubs.map((s) => s.id),
          archivedProperties: archived.map((p) => p.id),
        },
        reason,
      });

      return {
        subscriptionsCancelled: liveSubs.length,
        propertiesArchived: archived.length,
      };
    });

    return { deleted: true, ownerId: id, deletedAt: now, ...result };
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
    await this.get(ownerId); // 404s for a soft-deleted owner
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
    pinCode: r.pinCode,
    stateId: r.stateId,
    districtId: r.districtId,
    state: (r.address as { state?: string } | null)?.state ?? null,
    district: (r.address as { district?: string } | null)?.district ?? null,
    status: r.status,
    createdAt: r.createdAt,
    updatedAt: r.updatedAt,
    lastActiveAt: r.lastActiveAt,
  });
}
