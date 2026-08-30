import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, gt, inArray, isNull, lt, ne, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  hotelStaff,
  HotelStaffRole,
  HotelStaffStatus,
  locationDistricts,
  locationStates,
  owners,
  properties,
  propertyDailySnapshots,
  reservations,
  rooms,
  subscriptions,
  subscriptionPlans,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { CreatePropertyDto, CreateStaffDto, UpdateStaffDto, UpdatePropertyDto } from './dto';
import { OwnerErrors } from './owner-errors';
import { PropertiesService } from '../properties/properties.service';
import { normalizeIndianMobile, trimToNull } from './owner-input';
import { PropertyPhotosService } from './property-photos.service';

// Subscription statuses that grant the plan's property allowance.
const USABLE_SUB_STATUSES = ['TRIAL', 'ACTIVE', 'EXPIRING', 'GRACE_PERIOD'];

@Injectable()
export class OwnerPortalService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly photos: PropertyPhotosService,
    private readonly audit: AuditService,
    private readonly propertiesService: PropertiesService,
  ) {}

  private coverPhotoUrls(propertyIds: string[]): Promise<Map<string, string>> {
    return this.photos.coverUrls(propertyIds);
  }

  /**
   * Effective property limit: a per-subscription override replaces the plan
   * limit when set; otherwise the plan's property_limit applies. Returns 0
   * when the owner has no usable subscription.
   */
  static effectivePropertyLimit(
    planLimit: number | null | undefined,
    override: number | null | undefined,
  ): number {
    if (override !== null && override !== undefined) return override;
    return planLimit ?? 0;
  }

  private async currentLimit(ownerId: string): Promise<number> {
    const [sub] = await this.db
      .select({
        status: subscriptions.status,
        planLimit: subscriptionPlans.propertyLimit,
        override: subscriptions.propertyLimitOverride,
      })
      .from(subscriptions)
      .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
      .where(eq(subscriptions.ownerId, ownerId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    if (!sub || !USABLE_SUB_STATUSES.includes(sub.status)) return 0;
    return OwnerPortalService.effectivePropertyLimit(sub.planLimit, sub.override);
  }

  /**
   * The owner's portfolio tiles. Real numbers, across every hotel they own.
   *
   * `occupancy` is OCCUPIED rooms over every live room that is not
   * OUT_OF_ORDER — a wing that has been taken off the board cannot be sold, so
   * counting it as an empty room would report a hotel as failing to fill rooms
   * it is not offering. MAINTENANCE stays in the denominator: it is a same-day
   * state, not a withdrawal from inventory.
   *
   * `revenue` is paise for the CURRENT CALENDAR MONTH, summing `total_paise`
   * for every CHECKED_IN or CHECKED_OUT reservation whose stay TOUCHES the
   * month. That is an APPROXIMATION — a stay straddling month end is counted
   * whole in both months rather than apportioned per night — and it matches the
   * staff dashboard's figure exactly, deliberately: an owner and their GM
   * comparing screens must see the same number. It is a dashboard figure, not
   * an accounting one; night-level apportionment needs a folio/ledger table
   * that does not exist yet.
   */
  async portfolioSummary(ownerId: string) {
    const [row] = await this.db
      .select({
        hotels: sql<number>`count(*)::int`,
        rooms: sql<number>`coalesce(sum(${properties.roomCount}), 0)::int`,
      })
      .from(properties)
      .where(and(eq(properties.ownerId, ownerId), isNull(properties.deletedAt)));

    const propertyRows = await this.db
      .select({ id: properties.id })
      .from(properties)
      .where(and(eq(properties.ownerId, ownerId), isNull(properties.deletedAt)));
    const propertyIds = propertyRows.map((p) => p.id);
    if (propertyIds.length === 0) {
      return { hotels: row?.hotels ?? 0, rooms: row?.rooms ?? 0, revenue: 0, occupancy: 0 };
    }

    const [roomRow] = await this.db
      .select({
        sellable: sql<number>`count(*) filter (where ${rooms.status} <> 'OUT_OF_ORDER')::int`,
        occupied: sql<number>`count(*) filter (where ${rooms.status} = 'OCCUPIED')::int`,
      })
      .from(rooms)
      .where(and(inArray(rooms.propertyId, propertyIds), isNull(rooms.deletedAt)));

    const now = new Date();
    const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1))
      .toISOString()
      .slice(0, 10);
    const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1))
      .toISOString()
      .slice(0, 10);

    const [revenueRow] = await this.db
      .select({ total: sql<number>`coalesce(sum(${reservations.totalPaise}), 0)::bigint` })
      .from(reservations)
      .where(
        and(
          inArray(reservations.propertyId, propertyIds),
          isNull(reservations.deletedAt),
          inArray(reservations.status, ['CHECKED_IN', 'CHECKED_OUT']),
          // Strict inequalities: check_out is exclusive, so a stay ending on
          // the 1st does not belong to the month that starts on the 1st.
          lt(reservations.checkIn, monthEnd),
          gt(reservations.checkOut, monthStart),
        ),
      );

    const sellable = roomRow?.sellable ?? 0;
    return {
      hotels: row?.hotels ?? 0,
      rooms: row?.rooms ?? 0,
      revenue: Number(revenueRow?.total ?? 0),
      occupancy: sellable === 0 ? 0 : Math.round(((roomRow?.occupied ?? 0) / sellable) * 1000) / 10,
    };
  }

  async listProperties(ownerId: string) {
    const rows = await this.db
      .select()
      .from(properties)
      .where(and(eq(properties.ownerId, ownerId), isNull(properties.deletedAt)))
      .orderBy(desc(properties.createdAt));
    // One query for every cover photo rather than one per property.
    const covers = rows.length ? await this.coverPhotoUrls(rows.map((p) => p.id)) : new Map();
    return rows.map((p) => ({
      id: p.id,
      name: p.name,
      city: p.city,
      state: p.state,
      status: p.status,
      roomCount: p.roomCount,
      listingCompleteness: p.listingCompleteness,
      contact: p.contact,
      coverPhotoUrl: covers.get(p.id) ?? null,
    }));
  }

  async createProperty(ownerId: string, dto: CreatePropertyDto) {
    const limit = await this.currentLimit(ownerId);
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(properties)
      .where(and(eq(properties.ownerId, ownerId), isNull(properties.deletedAt)));
    if (count >= limit) throw OwnerErrors.propertyLimitReached();

    const slug =
      dto.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/^-+|-+$/g, '')
        .slice(0, 200) +
      '-' +
      Math.random().toString(36).slice(2, 8);

    const [row] = await this.db
      .insert(properties)
      .values({
        ownerId,
        name: dto.name,
        slug,
        city: dto.city,
        state: dto.state,
        country: dto.address.country ?? 'India',
        status: 'DRAFT',
        address: { ...dto.address, country: dto.address.country ?? 'India' } as never,
        // Contact details live in the existing jsonb column.
        contact: { phone: dto.phone, email: dto.email ?? null } as never,
      })
      .returning();
    return {
      id: row.id,
      name: row.name,
      city: row.city,
      state: row.state,
      status: row.status,
      roomCount: row.roomCount,
      listingCompleteness: row.listingCompleteness,
      contact: row.contact,
      // A freshly created property has no photos yet.
      coverPhotoUrl: null as string | null,
    };
  }

  /** One property the owner owns, or 404. */
  async getProperty(ownerId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(properties)
      .where(
        and(
          eq(properties.id, id),
          eq(properties.ownerId, ownerId),
          isNull(properties.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw OwnerErrors.propertyNotFound();
    const covers = await this.coverPhotoUrls([row.id]);
    return {
      id: row.id,
      name: row.name,
      city: row.city,
      state: row.state,
      country: row.country,
      status: row.status,
      roomCount: row.roomCount,
      listingCompleteness: row.listingCompleteness,
      contact: row.contact,
      address: row.address,
      coverPhotoUrl: covers.get(row.id) ?? null,
    };
  }

  /**
   * A hotel's operational snapshot for the owner: live occupancy today, today's
   * arrivals and departures, and a short occupancy history from the night audit.
   * Read-only visibility — owners do not run the front desk, but a hotel they
   * own should not be a black box after onboarding.
   */
  async propertyOperations(ownerId: string, id: string) {
    await this.assertOwnedProperty(ownerId, id);
    const today = new Date().toISOString().slice(0, 10);

    const [live] = await this.db
      .select({
        sellable: sql<number>`count(*) filter (where ${rooms.status} <> 'OUT_OF_ORDER')::int`,
        occupied: sql<number>`count(*) filter (where ${rooms.status} = 'OCCUPIED')::int`,
      })
      .from(rooms)
      .where(and(eq(rooms.propertyId, id), isNull(rooms.deletedAt)));

    const [counts] = await this.db
      .select({
        arrivals: sql<number>`count(*) filter (where ${reservations.checkIn} = ${today}::date AND ${reservations.status} in ('CONFIRMED','CHECKED_IN'))::int`,
        departures: sql<number>`count(*) filter (where ${reservations.checkOut} = ${today}::date AND ${reservations.status} in ('CHECKED_IN','CHECKED_OUT'))::int`,
        inHouse: sql<number>`count(*) filter (where ${reservations.status} = 'CHECKED_IN')::int`,
      })
      .from(reservations)
      .where(and(eq(reservations.propertyId, id), isNull(reservations.deletedAt)));

    const history = await this.db
      .select({
        date: propertyDailySnapshots.businessDate,
        occupancyPct: propertyDailySnapshots.occupancyPct,
        revenuePaise: propertyDailySnapshots.revenuePaise,
      })
      .from(propertyDailySnapshots)
      .where(eq(propertyDailySnapshots.propertyId, id))
      .orderBy(desc(propertyDailySnapshots.businessDate))
      .limit(14);

    const sellable = live?.sellable ?? 0;
    return {
      occupancyPct: sellable > 0 ? Math.round(((live?.occupied ?? 0) / sellable) * 100) : 0,
      roomsOccupied: live?.occupied ?? 0,
      roomsSellable: sellable,
      arrivalsToday: counts?.arrivals ?? 0,
      departuresToday: counts?.departures ?? 0,
      inHouse: counts?.inHouse ?? 0,
      history: history.slice().reverse(),
    };
  }

  /** Partial edit: only the provided fields change. Recomputes the listing score. */
  async updateProperty(ownerId: string, id: string, dto: UpdatePropertyDto) {
    await this.assertOwnedProperty(ownerId, id);
    const [current] = await this.db
      .select()
      .from(properties)
      .where(eq(properties.id, id))
      .limit(1);

    const patch: Partial<typeof properties.$inferInsert> = { updatedAt: new Date() };
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.city !== undefined) patch.city = dto.city;
    if (dto.state !== undefined) patch.state = dto.state;
    if (dto.address !== undefined) {
      const country = dto.address.country ?? current.country ?? 'India';
      patch.address = { ...dto.address, country } as never;
      patch.country = country;
    }
    if (dto.phone !== undefined || dto.email !== undefined) {
      const existing = (current.contact ?? {}) as { phone?: string; email?: string | null };
      patch.contact = {
        phone: dto.phone ?? existing.phone ?? '',
        email: dto.email ?? existing.email ?? null,
      } as never;
    }

    await this.db.update(properties).set(patch).where(eq(properties.id, id));
    // Name / location / contact feed the listing-completeness score.
    await this.propertiesService.recomputeCompleteness(id);
    await this.audit.record({
      action: 'owner.property.updated',
      entity: 'property',
      entityId: id,
      actorId: ownerId,
      after: patch,
    });
    return this.getProperty(ownerId, id);
  }

  /** Soft-delete (archive) a property the owner owns. Frees an allowance slot. */
  async archiveProperty(ownerId: string, id: string) {
    await this.assertOwnedProperty(ownerId, id);
    await this.db
      .update(properties)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(properties.id, id));
    await this.audit.record({
      action: 'owner.property.archived',
      entity: 'property',
      entityId: id,
      actorId: ownerId,
    });
    return { deleted: true, id };
  }

  /** Ensure the property belongs to this owner, else 404 (tenant isolation). */
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
    if (!row) throw OwnerErrors.ownerNotFound();
  }

  /**
   * EVERY live staff member at the property — not just the GM/AGM the owner
   * created. Staff a GM went on to hire (all 23 roles) live in the same
   * `hotel_staff` table, so they appear here automatically, and the owner's
   * existing status/delete actions keep working across all of them.
   */
  async listStaff(ownerId: string, propertyId: string) {
    await this.assertOwnedProperty(ownerId, propertyId);
    const rows = await this.db
      .select()
      .from(hotelStaff)
      .where(
        and(
          eq(hotelStaff.propertyId, propertyId),
          eq(hotelStaff.ownerId, ownerId),
          isNull(hotelStaff.deletedAt),
        ),
      )
      .orderBy(desc(hotelStaff.createdAt));
    return rows.map((s) => OwnerPortalService.staffDto(s));
  }

  /**
   * Portfolio-wide staff directory: every live staff member across every
   * property this owner holds, carrying the property name so the app can group
   * by hotel without an N+1.
   */
  async listAllStaff(ownerId: string) {
    const rows = await this.db
      .select({ s: hotelStaff, propertyName: properties.name })
      .from(hotelStaff)
      .innerJoin(properties, eq(hotelStaff.propertyId, properties.id))
      .where(
        and(
          eq(hotelStaff.ownerId, ownerId),
          isNull(hotelStaff.deletedAt),
          isNull(properties.deletedAt),
        ),
      )
      .orderBy(desc(hotelStaff.createdAt));
    return rows.map((r) => ({
      ...OwnerPortalService.staffDto(r.s),
      propertyId: r.s.propertyId,
      propertyName: r.propertyName,
    }));
  }

  private static staffDto(s: typeof hotelStaff.$inferSelect) {
    return {
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      fullName: `${s.firstName} ${s.lastName}`.trim(),
      email: s.email,
      mobile: s.mobile,
      // Carried so the owner app can pre-fill the edit form without a second
      // round trip.
      address: s.address,
      state: s.state,
      district: s.district,
      pinCode: s.pinCode,
      role: s.role,
      status: s.status,
      department: s.department,
      employeeId: s.employeeId,
      lastLoginAt: s.lastLoginAt,
    };
  }

  async createStaff(ownerId: string, propertyId: string, dto: CreateStaffDto) {
    await this.assertOwnedProperty(ownerId, propertyId);
    const [row] = await this.db
      .insert(hotelStaff)
      .values({
        propertyId,
        ownerId,
        role: dto.role as never,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email.toLowerCase(),
        mobile: dto.mobile,
        address: dto.address,
        pinCode: dto.pinCode,
        state: dto.state,
        district: dto.district,
        createdBy: ownerId,
      })
      .returning();
    return {
      id: row.id,
      firstName: row.firstName,
      lastName: row.lastName,
      email: row.email,
      mobile: row.mobile,
      state: row.state,
      district: row.district,
      pinCode: row.pinCode,
      role: row.role,
      status: row.status,
    };
  }

  /**
   * The state/district pair on a staff row is stored as TEXT names (unlike an
   * owner, which stores catalogue ids), so the pair is validated by name: the
   * state must exist in the admin catalogue and the district must sit under it.
   */
  private async assertLocationNames(stateName: string, districtName: string): Promise<void> {
    const [state] = await this.db
      .select({ id: locationStates.id, name: locationStates.name })
      .from(locationStates)
      .where(eq(locationStates.name, stateName))
      .limit(1);
    if (!state) {
      throw OwnerErrors.invalidLocation(`Unknown state "${stateName}"`);
    }
    const [district] = await this.db
      .select({ id: locationDistricts.id })
      .from(locationDistricts)
      .where(and(eq(locationDistricts.stateId, state.id), eq(locationDistricts.name, districtName)))
      .limit(1);
    if (!district) {
      throw OwnerErrors.invalidLocation(`District does not belong to ${state.name}`);
    }
  }

  /** The one live staff row at this property, or 404 — never 403. */
  private async loadOwnedStaff(ownerId: string, propertyId: string, staffId: string) {
    const [row] = await this.db
      .select()
      .from(hotelStaff)
      .where(
        and(
          eq(hotelStaff.id, staffId),
          eq(hotelStaff.propertyId, propertyId),
          eq(hotelStaff.ownerId, ownerId),
          isNull(hotelStaff.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw OwnerErrors.staffNotFound();
    return row;
  }

  /**
   * Edit an existing GM/AGM. Everything supplied is validated exactly as it is
   * on create; anything omitted is left untouched. Scoping is strict — a
   * property this owner does not hold, or a soft-deleted row, is a 404.
   */
  async updateStaff(ownerId: string, propertyId: string, staffId: string, dto: UpdateStaffDto) {
    await this.assertOwnedProperty(ownerId, propertyId);
    const before = await this.loadOwnedStaff(ownerId, propertyId, staffId);

    const patch: Partial<typeof hotelStaff.$inferInsert> = {};
    if (dto.role !== undefined) patch.role = dto.role as HotelStaffRole;
    if (dto.firstName !== undefined) patch.firstName = dto.firstName.trim();
    if (dto.lastName !== undefined) patch.lastName = dto.lastName.trim();
    if (dto.address !== undefined) patch.address = trimToNull(dto.address);
    if (dto.pinCode !== undefined) patch.pinCode = dto.pinCode;
    if (dto.department !== undefined) patch.department = trimToNull(dto.department);
    if (dto.employeeId !== undefined) patch.employeeId = trimToNull(dto.employeeId);
    if (dto.mobile !== undefined) patch.mobile = normalizeIndianMobile(dto.mobile);

    // State and district travel together so the pair can never drift apart.
    const changingLocation = dto.state !== undefined || dto.district !== undefined;
    if (changingLocation) {
      const stateName = dto.state ?? before.state;
      const districtName = dto.district ?? before.district;
      if (!stateName || !districtName) {
        throw OwnerErrors.invalidLocation(
          'Both state and district are required when changing the location',
        );
      }
      await this.assertLocationNames(stateName, districtName);
      patch.state = stateName;
      patch.district = districtName;
    }

    // The partial unique index is (property_id, email) WHERE deleted_at IS NULL.
    // Checking it here turns a raw 23505 into a typed, readable conflict; the
    // insert below still catches the race.
    let nextEmail: string | undefined;
    if (dto.email !== undefined) {
      nextEmail = dto.email.trim().toLowerCase();
      if (nextEmail !== before.email) {
        const clash = await this.db
          .select({ id: hotelStaff.id })
          .from(hotelStaff)
          .where(
            and(
              eq(hotelStaff.propertyId, propertyId),
              eq(hotelStaff.email, nextEmail),
              ne(hotelStaff.id, staffId),
              isNull(hotelStaff.deletedAt),
            ),
          )
          .limit(1);
        if (clash.length) throw OwnerErrors.staffEmailTaken();
      }
      patch.email = nextEmail;
    }

    if (Object.keys(patch).length === 0) throw OwnerErrors.nothingToUpdate();
    patch.updatedAt = new Date();

    let after: typeof hotelStaff.$inferSelect;
    try {
      [after] = await this.db
        .update(hotelStaff)
        .set(patch)
        .where(eq(hotelStaff.id, staffId))
        .returning();
    } catch (err) {
      // Lost the race against a concurrent write to the same (property, email).
      if ((err as { code?: string }).code === '23505') throw OwnerErrors.staffEmailTaken();
      throw err;
    }

    await this.audit.record({
      action: 'owner.staff.updated',
      entity: 'hotel_staff',
      entityId: staffId,
      before,
      after,
      actorId: ownerId,
      actorRole: 'OWNER',
    });
    return OwnerPortalService.staffDto(after);
  }

  async setStaffStatus(ownerId: string, propertyId: string, staffId: string, status: string) {
    await this.assertOwnedProperty(ownerId, propertyId);
    const [row] = await this.db
      .select({ id: hotelStaff.id })
      .from(hotelStaff)
      .where(
        and(
          eq(hotelStaff.id, staffId),
          eq(hotelStaff.propertyId, propertyId),
          eq(hotelStaff.ownerId, ownerId),
          isNull(hotelStaff.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw OwnerErrors.ownerNotFound();
    await this.db
      .update(hotelStaff)
      .set({ status: status as HotelStaffStatus, updatedAt: new Date() })
      .where(eq(hotelStaff.id, staffId));
    return { id: staffId, status };
  }

  async deleteStaff(ownerId: string, propertyId: string, staffId: string) {
    await this.assertOwnedProperty(ownerId, propertyId);
    const [row] = await this.db
      .select({ id: hotelStaff.id })
      .from(hotelStaff)
      .where(
        and(
          eq(hotelStaff.id, staffId),
          eq(hotelStaff.propertyId, propertyId),
          eq(hotelStaff.ownerId, ownerId),
          isNull(hotelStaff.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw OwnerErrors.ownerNotFound();
    await this.db
      .update(hotelStaff)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(hotelStaff.id, staffId));
    return { id: staffId, deleted: true };
  }

  async ownerExists(ownerId: string): Promise<boolean> {
    const [row] = await this.db
      .select({ id: owners.id })
      .from(owners)
      .where(eq(owners.id, ownerId))
      .limit(1);
    return Boolean(row);
  }
}
