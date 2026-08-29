import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  hotelStaff,
  HotelStaffStatus,
  owners,
  properties,
  subscriptions,
  subscriptionPlans,
} from '../../database/schema';
import { CreatePropertyDto, CreateStaffDto } from './dto';
import { OwnerErrors } from './owner-errors';
import { PropertyPhotosService } from './property-photos.service';

// Subscription statuses that grant the plan's property allowance.
const USABLE_SUB_STATUSES = ['TRIAL', 'ACTIVE', 'EXPIRING', 'GRACE_PERIOD'];

@Injectable()
export class OwnerPortalService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly photos: PropertyPhotosService,
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

  async portfolioSummary(ownerId: string) {
    const [row] = await this.db
      .select({
        hotels: sql<number>`count(*)::int`,
        rooms: sql<number>`coalesce(sum(${properties.roomCount}), 0)::int`,
      })
      .from(properties)
      .where(and(eq(properties.ownerId, ownerId), isNull(properties.deletedAt)));
    return {
      hotels: row?.hotels ?? 0,
      rooms: row?.rooms ?? 0,
      revenue: 0,
      occupancy: 0,
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
