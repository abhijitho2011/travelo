import { ConflictException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  coupons,
  addonServices,
  bookingSources,
  propertyPolicies,
  propertySettings,
  propertyTaxes,
  type PropertySettings,
} from '../../database/schema';
import {
  AddonInputDto,
  BookingSourceInputDto,
  PolicyInputDto,
  TaxInputDto,
  UpdateAddonDto,
  UpdateBookingSourceDto,
  UpdatePolicyDto,
  UpdatePropertySettingsDto,
  UpdateTaxDto,
  CouponInputDto,
  UpdateCouponDto,
} from './dto';

/**
 * Property configuration: the settings document plus the four small catalogues
 * (taxes, policies, add-ons, booking sources) a hotel maintains about itself.
 *
 * Every read is scoped to the caller's own property and every catalogue row
 * is resolved by (id, propertyId, not deleted) — a row at another hotel is a
 * 404, never a 403 that would confirm it exists.
 */
@Injectable()
export class PropertyConfigService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // ------------------------------------------------------------ settings --

  /**
   * The settings row, created on first read with every default so callers
   * never have to special-case "not configured yet". Idempotent under a race:
   * the insert ignores a conflict and re-reads.
   */
  async settings(propertyId: string): Promise<PropertySettings> {
    const [existing] = await this.db
      .select()
      .from(propertySettings)
      .where(eq(propertySettings.propertyId, propertyId))
      .limit(1);
    if (existing) return existing;
    await this.db.insert(propertySettings).values({ propertyId }).onConflictDoNothing();
    const [created] = await this.db
      .select()
      .from(propertySettings)
      .where(eq(propertySettings.propertyId, propertyId))
      .limit(1);
    return created;
  }

  /** The settings row behind a public booking-page slug, if the page is on. */
  async settingsBySlug(slug: string): Promise<PropertySettings | null> {
    const [row] = await this.db
      .select()
      .from(propertySettings)
      .where(
        and(
          eq(propertySettings.bookingEngineSlug, slug),
          eq(propertySettings.bookingEngineEnabled, true),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async updateSettings(propertyId: string, dto: UpdatePropertySettingsDto) {
    await this.settings(propertyId); // ensure the row exists
    if (dto.bookingEngineSlug) {
      // The slug is the public URL of the hosted booking page; two hotels
      // cannot share one. Checked here for a clean 409 before the unique index.
      const [taken] = await this.db
        .select({ propertyId: propertySettings.propertyId })
        .from(propertySettings)
        .where(eq(propertySettings.bookingEngineSlug, dto.bookingEngineSlug))
        .limit(1);
      if (taken && taken.propertyId !== propertyId) {
        throw new ConflictException({
          error: 'BOOKING_SLUG_TAKEN',
          message: `The booking page address "${dto.bookingEngineSlug}" is already in use`,
        });
      }
    }
    const patch: Partial<typeof propertySettings.$inferInsert> = { updatedAt: new Date() };
    for (const key of Object.keys(dto) as (keyof UpdatePropertySettingsDto)[]) {
      if (dto[key] !== undefined) (patch as Record<string, unknown>)[key] = dto[key];
    }
    const [row] = await this.db
      .update(propertySettings)
      .set(patch)
      .where(eq(propertySettings.propertyId, propertyId))
      .returning();
    return row;
  }

  // --------------------------------------------------------------- taxes --

  listTaxes(propertyId: string) {
    return this.db
      .select()
      .from(propertyTaxes)
      .where(and(eq(propertyTaxes.propertyId, propertyId), isNull(propertyTaxes.deletedAt)))
      .orderBy(asc(propertyTaxes.sortOrder), asc(propertyTaxes.name));
  }

  /** Only the active ones, for the folio engine. */
  async activeTaxes(propertyId: string) {
    const rows = await this.listTaxes(propertyId);
    return rows.filter((t) => t.isActive);
  }

  async createTax(propertyId: string, dto: TaxInputDto) {
    const [row] = await this.db
      .insert(propertyTaxes)
      .values({ propertyId, ...dto })
      .returning();
    return row;
  }

  async updateTax(propertyId: string, id: string, dto: UpdateTaxDto) {
    await this.requireTax(propertyId, id);
    const [row] = await this.db
      .update(propertyTaxes)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(propertyTaxes.id, id))
      .returning();
    return row;
  }

  async deleteTax(propertyId: string, id: string) {
    await this.requireTax(propertyId, id);
    await this.db
      .update(propertyTaxes)
      .set({ deletedAt: new Date() })
      .where(eq(propertyTaxes.id, id));
    return { id, deleted: true };
  }

  private async requireTax(propertyId: string, id: string) {
    const [row] = await this.db
      .select({ id: propertyTaxes.id })
      .from(propertyTaxes)
      .where(
        and(
          eq(propertyTaxes.id, id),
          eq(propertyTaxes.propertyId, propertyId),
          isNull(propertyTaxes.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw new NotFoundException({ error: 'TAX_NOT_FOUND', message: 'Tax not found' });
  }

  // ------------------------------------------------------------ policies --

  listPolicies(propertyId: string) {
    return this.db
      .select()
      .from(propertyPolicies)
      .where(and(eq(propertyPolicies.propertyId, propertyId), isNull(propertyPolicies.deletedAt)))
      .orderBy(asc(propertyPolicies.kind), asc(propertyPolicies.name));
  }

  /** The default active policy of one kind, if the hotel set one. */
  async defaultPolicy(propertyId: string, kind: (typeof propertyPolicies.$inferSelect)['kind']) {
    const rows = await this.listPolicies(propertyId);
    return rows.find((p) => p.kind === kind && p.isActive && p.isDefault) ?? null;
  }

  async createPolicy(propertyId: string, dto: PolicyInputDto) {
    return this.db.transaction(async (tx) => {
      // One default per kind: a new default demotes the old one in the same
      // transaction, so there is never a moment with two.
      if (dto.isDefault) {
        await tx
          .update(propertyPolicies)
          .set({ isDefault: false })
          .where(
            and(eq(propertyPolicies.propertyId, propertyId), eq(propertyPolicies.kind, dto.kind)),
          );
      }
      const [row] = await tx
        .insert(propertyPolicies)
        .values({ propertyId, ...dto })
        .returning();
      return row;
    });
  }

  async updatePolicy(propertyId: string, id: string, dto: UpdatePolicyDto) {
    const before = await this.requirePolicy(propertyId, id);
    return this.db.transaction(async (tx) => {
      if (dto.isDefault) {
        await tx
          .update(propertyPolicies)
          .set({ isDefault: false })
          .where(
            and(
              eq(propertyPolicies.propertyId, propertyId),
              eq(propertyPolicies.kind, before.kind),
            ),
          );
      }
      const [row] = await tx
        .update(propertyPolicies)
        .set({ ...dto, updatedAt: new Date() })
        .where(eq(propertyPolicies.id, id))
        .returning();
      return row;
    });
  }

  async deletePolicy(propertyId: string, id: string) {
    await this.requirePolicy(propertyId, id);
    await this.db
      .update(propertyPolicies)
      .set({ deletedAt: new Date() })
      .where(eq(propertyPolicies.id, id));
    return { id, deleted: true };
  }

  private async requirePolicy(propertyId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(propertyPolicies)
      .where(
        and(
          eq(propertyPolicies.id, id),
          eq(propertyPolicies.propertyId, propertyId),
          isNull(propertyPolicies.deletedAt),
        ),
      )
      .limit(1);
    if (!row) {
      throw new NotFoundException({ error: 'POLICY_NOT_FOUND', message: 'Policy not found' });
    }
    return row;
  }

  // ------------------------------------------------------------- add-ons --

  listAddons(propertyId: string) {
    return this.db
      .select()
      .from(addonServices)
      .where(and(eq(addonServices.propertyId, propertyId), isNull(addonServices.deletedAt)))
      .orderBy(asc(addonServices.sortOrder), asc(addonServices.name));
  }

  async requireAddon(propertyId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(addonServices)
      .where(
        and(
          eq(addonServices.id, id),
          eq(addonServices.propertyId, propertyId),
          isNull(addonServices.deletedAt),
        ),
      )
      .limit(1);
    if (!row)
      throw new NotFoundException({ error: 'ADDON_NOT_FOUND', message: 'Add-on not found' });
    return row;
  }

  async createAddon(propertyId: string, dto: AddonInputDto) {
    const [row] = await this.db
      .insert(addonServices)
      .values({ propertyId, ...dto })
      .returning();
    return row;
  }

  async updateAddon(propertyId: string, id: string, dto: UpdateAddonDto) {
    await this.requireAddon(propertyId, id);
    const [row] = await this.db
      .update(addonServices)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(addonServices.id, id))
      .returning();
    return row;
  }

  async deleteAddon(propertyId: string, id: string) {
    await this.requireAddon(propertyId, id);
    await this.db
      .update(addonServices)
      .set({ deletedAt: new Date() })
      .where(eq(addonServices.id, id));
    return { id, deleted: true };
  }

  // ----------------------------------------------------- booking sources --

  listSources(propertyId: string) {
    return this.db
      .select()
      .from(bookingSources)
      .where(and(eq(bookingSources.propertyId, propertyId), isNull(bookingSources.deletedAt)))
      .orderBy(asc(bookingSources.sortOrder), asc(bookingSources.name));
  }

  async requireSource(propertyId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(bookingSources)
      .where(
        and(
          eq(bookingSources.id, id),
          eq(bookingSources.propertyId, propertyId),
          isNull(bookingSources.deletedAt),
        ),
      )
      .limit(1);
    if (!row) {
      throw new NotFoundException({
        error: 'SOURCE_NOT_FOUND',
        message: 'Booking source not found',
      });
    }
    return row;
  }

  async createSource(propertyId: string, dto: BookingSourceInputDto) {
    const [row] = await this.db
      .insert(bookingSources)
      .values({ propertyId, ...dto })
      .returning();
    return row;
  }

  async updateSource(propertyId: string, id: string, dto: UpdateBookingSourceDto) {
    await this.requireSource(propertyId, id);
    const [row] = await this.db
      .update(bookingSources)
      .set(dto)
      .where(eq(bookingSources.id, id))
      .returning();
    return row;
  }

  async deleteSource(propertyId: string, id: string) {
    await this.requireSource(propertyId, id);
    await this.db
      .update(bookingSources)
      .set({ deletedAt: new Date() })
      .where(eq(bookingSources.id, id));
    return { id, deleted: true };
  }

  // -------------------------------------------------------------- coupons --

  listCoupons(propertyId: string) {
    return this.db
      .select()
      .from(coupons)
      .where(and(eq(coupons.propertyId, propertyId), isNull(coupons.deletedAt)))
      .orderBy(asc(coupons.code));
  }

  async createCoupon(propertyId: string, dto: CouponInputDto) {
    const [row] = await this.db
      .insert(coupons)
      .values({ propertyId, ...dto, code: dto.code.toUpperCase() })
      .returning();
    return row;
  }

  async updateCoupon(propertyId: string, id: string, dto: UpdateCouponDto) {
    await this.requireCoupon(propertyId, id);
    const [row] = await this.db.update(coupons).set(dto).where(eq(coupons.id, id)).returning();
    return row;
  }

  async deleteCoupon(propertyId: string, id: string) {
    await this.requireCoupon(propertyId, id);
    await this.db.update(coupons).set({ deletedAt: new Date() }).where(eq(coupons.id, id));
    return { id, deleted: true };
  }

  private async requireCoupon(propertyId: string, id: string) {
    const [row] = await this.db
      .select({ id: coupons.id })
      .from(coupons)
      .where(and(eq(coupons.id, id), eq(coupons.propertyId, propertyId), isNull(coupons.deletedAt)))
      .limit(1);
    if (!row)
      throw new NotFoundException({ error: 'COUPON_NOT_FOUND', message: 'Coupon not found' });
  }

  /**
   * Validate a code for a stay: active, in its dates, min nights met, uses
   * left. Returns the discount in paise on `subtotalPaise`, or a reason.
   */
  async redeemableCoupon(
    propertyId: string,
    code: string,
    stay: { checkIn: string; nights: number; subtotalPaise: number },
  ): Promise<{
    coupon: typeof coupons.$inferSelect | null;
    discountPaise: number;
    reason: string | null;
  }> {
    const [c] = await this.db
      .select()
      .from(coupons)
      .where(
        and(
          eq(coupons.propertyId, propertyId),
          sql`upper(${coupons.code}) = ${code.toUpperCase()}`,
          isNull(coupons.deletedAt),
        ),
      )
      .limit(1);
    if (!c || !c.isActive)
      return { coupon: null, discountPaise: 0, reason: 'That code is not valid' };
    if (c.validFrom && stay.checkIn < c.validFrom)
      return { coupon: c, discountPaise: 0, reason: 'That code is not valid yet' };
    if (c.validTo && stay.checkIn > c.validTo)
      return { coupon: c, discountPaise: 0, reason: 'That code has expired' };
    if (c.minNights && stay.nights < c.minNights)
      return {
        coupon: c,
        discountPaise: 0,
        reason: `That code needs a stay of ${c.minNights} nights`,
      };
    if (c.maxUses && c.uses >= c.maxUses)
      return { coupon: c, discountPaise: 0, reason: 'That code has been used up' };
    const discount =
      c.kind === 'PERCENT'
        ? Math.round((stay.subtotalPaise * c.value) / 10_000)
        : Math.min(c.value, stay.subtotalPaise);
    return { coupon: c, discountPaise: discount, reason: null };
  }

  /** Count a use. Guarded so a burst cannot exceed maxUses. */
  async consumeCoupon(id: string): Promise<void> {
    await this.db
      .update(coupons)
      .set({ uses: sql`${coupons.uses} + 1` })
      .where(
        and(
          eq(coupons.id, id),
          sql`(${coupons.maxUses} is null or ${coupons.uses} < ${coupons.maxUses})`,
        ),
      );
  }
}
