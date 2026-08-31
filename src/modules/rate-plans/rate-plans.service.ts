import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  pricingRules,
  ratePlans,
  roomTypeFees,
  roomTypes,
  type PricingRule,
  type RatePlan,
  type RoomTypeFee,
} from '../../database/schema';
import { RatePlanErrors } from './rate-plan-errors';
import type {
  CreateFeeDto,
  CreatePricingRuleDto,
  CreateRatePlanDto,
  UpdateFeeDto,
  UpdatePricingRuleDto,
  UpdateRatePlanDto,
} from './dto';

/**
 * Rate plans, taxes/fees and dynamic pricing rules for a room type.
 *
 * Every method takes the CALLER'S OWN propertyId — never a client parameter —
 * and every room type is re-verified against it before a write. A room type at
 * another property is therefore indistinguishable from a missing one: 404,
 * never 403.
 *
 * Money is integer paise; percentages are integer basis points (1250 = 12.5%).
 */

export interface RatePlanDto {
  id: string;
  roomTypeId: string;
  name: string;
  basePricePaise: number;
  currency: string;
  mealPlan: RatePlan['mealPlan'];
  cancellationPolicy: RatePlan['cancellationPolicy'];
  cancellationNote: string | null;
  paymentPolicy: RatePlan['paymentPolicy'];
  minStay: number | null;
  maxStay: number | null;
  minAdvanceDays: number | null;
  maxAdvanceDays: number | null;
  extraAdultPaise: number;
  extraChildPaise: number;
  extraInfantPaise: number;
  status: RatePlan['status'];
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface FeeDto {
  id: string;
  roomTypeId: string;
  name: string;
  kind: RoomTypeFee['kind'];
  calculation: RoomTypeFee['calculation'];
  /** BASIS POINTS when `calculation` is PERCENT, PAISE when FIXED. */
  value: number;
  basis: RoomTypeFee['basis'];
  period: RoomTypeFee['period'];
  sortOrder: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PricingRuleDto {
  id: string;
  roomTypeId: string;
  trigger: PricingRule['trigger'];
  comparator: PricingRule['comparator'];
  /** Meaning depends on `trigger` — see the schema. */
  threshold: number | null;
  startDate: string | null;
  endDate: string | null;
  adjustmentKind: PricingRule['adjustmentKind'];
  /** Basis points for PERCENT, paise for FIXED; negative = discount. */
  adjustmentValue: number;
  enabled: boolean;
  priority: number;
  createdAt: Date;
  updatedAt: Date;
}

// ---------- Pricing preview ----------

/** The shape the preview helper needs — a stored fee row satisfies it. */
export interface PreviewFee {
  name: string;
  calculation: RoomTypeFee['calculation'];
  value: number;
  basis: RoomTypeFee['basis'];
  period: RoomTypeFee['period'];
}

export interface PreviewInput {
  /** Paise, per unit, PER NIGHT. */
  basePricePaise: number;
  fees: PreviewFee[];
  nights: number;
  guests: number;
  /** true = the advertised price already contains the taxes. */
  pricesIncludeTax: boolean;
}

export interface PricingPreview {
  /** The room charge for the whole stay, EXCLUSIVE of tax. */
  basePaise: number;
  feeLines: Array<{ name: string; amountPaise: number }>;
  /** Sum of every fee line. */
  taxTotalPaise: number;
  /** What the guest pays: basePaise + taxTotalPaise, always exactly. */
  guestTotalPaise: number;
}

const BPS = 10_000;

/** Integer rounding, half away from zero — symmetric for negative values. */
function roundHalfAwayFromZero(n: number): number {
  return n < 0 ? -Math.round(-n) : Math.round(n);
}

/** PER_GUEST multiplies by guests, PER_NIGHT by nights; both default to 1. */
function feeMultiplier(fee: PreviewFee, nights: number, guests: number): number {
  return (fee.period === 'PER_NIGHT' ? nights : 1) * (fee.basis === 'PER_GUEST' ? guests : 1);
}

@Injectable()
export class RatePlansService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * PURE pricing preview — no database, no clock, no `this`. This is the quote
   * the booking UI shows before anything is stored.
   *
   * The rule is uniform for both fee calculations: work out ONE UNIT of the
   * fee, then multiply by the integer factors.
   *   - PERCENT: one unit is `value` basis points of ONE NIGHT'S base rate.
   *   - FIXED:   one unit is `value` paise.
   *   - PER_NIGHT multiplies by nights, PER_STAY does not.
   *   - PER_GUEST multiplies by guests, PER_ROOM does not.
   * Only the per-unit percent step rounds; everything after it is integer
   * multiplication, so the totals are exact and the lines always sum.
   *
   * EXCLUSIVE (`pricesIncludeTax: false`) — the advertised rate is net:
   *   basePaise = basePricePaise * nights, fees are added ON TOP.
   *
   * INCLUSIVE (`pricesIncludeTax: true`) — the advertised rate is what the
   * guest pays, so the tax is EXTRACTED from it instead. The net per-night rate
   * `n` is solved for exactly:
   *   gross = n*nights + Σ n*(bps_i/BPS)*m_i + Σ fixed_j*m_j
   *   =>  n = (gross - fixedTotal) * BPS / (nights*BPS + Σ bps_i*m_i)
   * Fee lines are then computed from `n`, and `basePaise` is whatever is left
   * of the gross — which makes `guestTotalPaise === basePricePaise * nights`
   * to the paise, with no residue hidden anywhere.
   */
  static previewPricing(input: PreviewInput): PricingPreview {
    const nights = Math.max(0, Math.trunc(input.nights));
    const guests = Math.max(0, Math.trunc(input.guests));
    const fees = input.fees ?? [];

    if (nights === 0) {
      return {
        basePaise: 0,
        feeLines: fees.map((f) => ({ name: f.name, amountPaise: 0 })),
        taxTotalPaise: 0,
        guestTotalPaise: 0,
      };
    }

    const gross = input.basePricePaise * nights;

    // The per-night rate the percentage fees are charged against.
    let perNight = input.basePricePaise;

    if (input.pricesIncludeTax) {
      let fixedTotal = 0;
      let bpsWeighted = 0;
      for (const fee of fees) {
        const m = feeMultiplier(fee, nights, guests);
        if (fee.calculation === 'FIXED') fixedTotal += fee.value * m;
        else bpsWeighted += fee.value * m;
      }
      const denominator = nights * BPS + bpsWeighted;
      perNight =
        denominator === 0 ? 0 : roundHalfAwayFromZero(((gross - fixedTotal) * BPS) / denominator);
      if (perNight < 0) perNight = 0;
    }

    const feeLines = fees.map((fee) => {
      const unit =
        fee.calculation === 'PERCENT'
          ? roundHalfAwayFromZero((perNight * fee.value) / BPS)
          : fee.value;
      return { name: fee.name, amountPaise: unit * feeMultiplier(fee, nights, guests) };
    });

    const taxTotalPaise = feeLines.reduce((sum, line) => sum + line.amountPaise, 0);

    // Inclusive: the guest pays the advertised gross and the base absorbs the
    // rounding residue. Exclusive: the fees are added on top.
    const basePaise = input.pricesIncludeTax ? gross - taxTotalPaise : gross;

    return { basePaise, feeLines, taxTotalPaise, guestTotalPaise: basePaise + taxTotalPaise };
  }

  // ---------- Rate plans ----------

  async listPlans(propertyId: string, roomTypeId?: string): Promise<{ items: RatePlanDto[] }> {
    const conds = [eq(ratePlans.propertyId, propertyId), isNull(ratePlans.deletedAt)];
    if (roomTypeId) {
      // Verified first so a foreign room type 404s instead of returning [].
      await this.requireRoomType(propertyId, roomTypeId);
      conds.push(eq(ratePlans.roomTypeId, roomTypeId));
    }
    const rows = await this.db
      .select()
      .from(ratePlans)
      .where(and(...conds))
      .orderBy(asc(ratePlans.sortOrder), asc(ratePlans.name));
    return { items: rows.map(RatePlansService.toPlanDto) };
  }

  async createPlan(propertyId: string, dto: CreateRatePlanDto): Promise<RatePlanDto> {
    await this.requireRoomType(propertyId, dto.roomTypeId);
    RatePlansService.validatePlan(dto);
    await this.assertNameFree(dto.roomTypeId, dto.name);

    try {
      const [row] = await this.db
        .insert(ratePlans)
        .values({
          propertyId,
          roomTypeId: dto.roomTypeId,
          name: dto.name.trim(),
          basePricePaise: dto.basePricePaise ?? 0,
          currency: dto.currency ?? 'INR',
          mealPlan: dto.mealPlan ?? 'ROOM_ONLY',
          cancellationPolicy: dto.cancellationPolicy ?? 'FLEXIBLE',
          cancellationNote: dto.cancellationNote ?? null,
          paymentPolicy: dto.paymentPolicy ?? 'PAY_AT_PROPERTY',
          minStay: dto.minStay ?? null,
          maxStay: dto.maxStay ?? null,
          minAdvanceDays: dto.minAdvanceDays ?? null,
          maxAdvanceDays: dto.maxAdvanceDays ?? null,
          extraAdultPaise: dto.extraAdultPaise ?? 0,
          extraChildPaise: dto.extraChildPaise ?? 0,
          extraInfantPaise: dto.extraInfantPaise ?? 0,
          status: dto.status ?? 'ACTIVE',
          sortOrder: dto.sortOrder ?? 0,
        })
        .returning();
      return RatePlansService.toPlanDto(row);
    } catch (err) {
      // The partial unique index is the real arbiter under a race.
      if ((err as { code?: string }).code === '23505') throw RatePlanErrors.nameTaken(dto.name);
      throw err;
    }
  }

  async updatePlan(propertyId: string, id: string, dto: UpdateRatePlanDto): Promise<RatePlanDto> {
    const existing = await this.requirePlan(propertyId, id);
    // Validated against the MERGED row: a patch that only moves maxStay still
    // has to agree with the stored minStay.
    RatePlansService.validatePlan({ ...RatePlansService.toPlanDto(existing), ...dto });

    if (dto.name !== undefined && dto.name.trim() !== existing.name) {
      await this.assertNameFree(existing.roomTypeId, dto.name, id);
    }

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of [
      'basePricePaise',
      'currency',
      'mealPlan',
      'cancellationPolicy',
      'cancellationNote',
      'paymentPolicy',
      'minStay',
      'maxStay',
      'minAdvanceDays',
      'maxAdvanceDays',
      'extraAdultPaise',
      'extraChildPaise',
      'extraInfantPaise',
      'status',
      'sortOrder',
    ] as const) {
      if (dto[key] !== undefined) patch[key] = dto[key];
    }
    if (dto.name !== undefined) patch.name = dto.name.trim();

    try {
      const [row] = await this.db
        .update(ratePlans)
        .set(patch)
        .where(and(eq(ratePlans.id, id), eq(ratePlans.propertyId, propertyId)))
        .returning();
      if (!row) throw RatePlanErrors.notFound();
      return RatePlansService.toPlanDto(row);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') {
        throw RatePlanErrors.nameTaken(dto.name ?? existing.name);
      }
      throw err;
    }
  }

  /** SOFT delete — the partial unique index then frees the name again. */
  async removePlan(propertyId: string, id: string): Promise<{ deleted: true; id: string }> {
    await this.requirePlan(propertyId, id);
    const now = new Date();
    const [row] = await this.db
      .update(ratePlans)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(ratePlans.id, id), eq(ratePlans.propertyId, propertyId)))
      .returning();
    if (!row) throw RatePlanErrors.notFound();
    return { deleted: true, id };
  }

  async setPlanStatus(
    propertyId: string,
    id: string,
    status: RatePlan['status'],
  ): Promise<RatePlanDto> {
    await this.requirePlan(propertyId, id);
    const [row] = await this.db
      .update(ratePlans)
      .set({ status, updatedAt: new Date() })
      .where(and(eq(ratePlans.id, id), eq(ratePlans.propertyId, propertyId)))
      .returning();
    if (!row) throw RatePlanErrors.notFound();
    return RatePlansService.toPlanDto(row);
  }

  // ---------- Fees ----------

  async listFees(propertyId: string, roomTypeId: string): Promise<{ items: FeeDto[] }> {
    await this.requireRoomType(propertyId, roomTypeId);
    const rows = await this.db
      .select()
      .from(roomTypeFees)
      .where(
        and(
          eq(roomTypeFees.propertyId, propertyId),
          eq(roomTypeFees.roomTypeId, roomTypeId),
          isNull(roomTypeFees.deletedAt),
        ),
      )
      .orderBy(asc(roomTypeFees.sortOrder), asc(roomTypeFees.name));
    return { items: rows.map(RatePlansService.toFeeDto) };
  }

  async createFee(propertyId: string, roomTypeId: string, dto: CreateFeeDto): Promise<FeeDto> {
    await this.requireRoomType(propertyId, roomTypeId);
    RatePlansService.validateFee(dto.calculation ?? 'PERCENT', dto.value);
    const [row] = await this.db
      .insert(roomTypeFees)
      .values({
        propertyId,
        roomTypeId,
        name: dto.name.trim(),
        kind: dto.kind ?? 'TAX',
        calculation: dto.calculation ?? 'PERCENT',
        value: dto.value,
        basis: dto.basis ?? 'PER_ROOM',
        period: dto.period ?? 'PER_NIGHT',
        sortOrder: dto.sortOrder ?? 0,
      })
      .returning();
    return RatePlansService.toFeeDto(row);
  }

  async updateFee(propertyId: string, id: string, dto: UpdateFeeDto): Promise<FeeDto> {
    const existing = await this.requireFee(propertyId, id);
    RatePlansService.validateFee(
      dto.calculation ?? existing.calculation,
      dto.value ?? existing.value,
    );

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of ['kind', 'calculation', 'value', 'basis', 'period', 'sortOrder'] as const) {
      if (dto[key] !== undefined) patch[key] = dto[key];
    }
    if (dto.name !== undefined) patch.name = dto.name.trim();

    const [row] = await this.db
      .update(roomTypeFees)
      .set(patch)
      .where(and(eq(roomTypeFees.id, id), eq(roomTypeFees.propertyId, propertyId)))
      .returning();
    if (!row) throw RatePlanErrors.feeNotFound();
    return RatePlansService.toFeeDto(row);
  }

  async removeFee(propertyId: string, id: string): Promise<{ deleted: true; id: string }> {
    await this.requireFee(propertyId, id);
    const now = new Date();
    const [row] = await this.db
      .update(roomTypeFees)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(roomTypeFees.id, id), eq(roomTypeFees.propertyId, propertyId)))
      .returning();
    if (!row) throw RatePlanErrors.feeNotFound();
    return { deleted: true, id };
  }

  // ---------- Pricing rules ----------

  async listPricingRules(
    propertyId: string,
    roomTypeId: string,
  ): Promise<{ items: PricingRuleDto[] }> {
    await this.requireRoomType(propertyId, roomTypeId);
    const rows = await this.db
      .select()
      .from(pricingRules)
      .where(
        and(
          eq(pricingRules.propertyId, propertyId),
          eq(pricingRules.roomTypeId, roomTypeId),
          isNull(pricingRules.deletedAt),
        ),
      )
      .orderBy(asc(pricingRules.priority), asc(pricingRules.trigger));
    return { items: rows.map(RatePlansService.toRuleDto) };
  }

  async createPricingRule(
    propertyId: string,
    roomTypeId: string,
    dto: CreatePricingRuleDto,
  ): Promise<PricingRuleDto> {
    await this.requireRoomType(propertyId, roomTypeId);
    RatePlansService.validateRule(dto.startDate, dto.endDate);
    const [row] = await this.db
      .insert(pricingRules)
      .values({
        propertyId,
        roomTypeId,
        trigger: dto.trigger,
        comparator: dto.comparator ?? 'GTE',
        threshold: dto.threshold ?? null,
        startDate: dto.startDate ?? null,
        endDate: dto.endDate ?? null,
        adjustmentKind: dto.adjustmentKind ?? 'PERCENT',
        adjustmentValue: dto.adjustmentValue,
        enabled: dto.enabled ?? true,
        priority: dto.priority ?? 0,
      })
      .returning();
    return RatePlansService.toRuleDto(row);
  }

  async updatePricingRule(
    propertyId: string,
    id: string,
    dto: UpdatePricingRuleDto,
  ): Promise<PricingRuleDto> {
    const existing = await this.requirePricingRule(propertyId, id);
    RatePlansService.validateRule(
      dto.startDate ?? existing.startDate ?? undefined,
      dto.endDate ?? existing.endDate ?? undefined,
    );

    const patch: Record<string, unknown> = { updatedAt: new Date() };
    for (const key of [
      'trigger',
      'comparator',
      'threshold',
      'startDate',
      'endDate',
      'adjustmentKind',
      'adjustmentValue',
      'enabled',
      'priority',
    ] as const) {
      if (dto[key] !== undefined) patch[key] = dto[key];
    }

    const [row] = await this.db
      .update(pricingRules)
      .set(patch)
      .where(and(eq(pricingRules.id, id), eq(pricingRules.propertyId, propertyId)))
      .returning();
    if (!row) throw RatePlanErrors.pricingRuleNotFound();
    return RatePlansService.toRuleDto(row);
  }

  async removePricingRule(propertyId: string, id: string): Promise<{ deleted: true; id: string }> {
    await this.requirePricingRule(propertyId, id);
    const now = new Date();
    const [row] = await this.db
      .update(pricingRules)
      .set({ deletedAt: now, updatedAt: now })
      .where(and(eq(pricingRules.id, id), eq(pricingRules.propertyId, propertyId)))
      .returning();
    if (!row) throw RatePlanErrors.pricingRuleNotFound();
    return { deleted: true, id };
  }

  // ---------- internals ----------

  /** The ONLY tenant check that matters: the type must be at MY property. */
  private async requireRoomType(propertyId: string, roomTypeId: string) {
    const [type] = await this.db
      .select({ id: roomTypes.id })
      .from(roomTypes)
      .where(
        and(
          eq(roomTypes.id, roomTypeId),
          eq(roomTypes.propertyId, propertyId),
          isNull(roomTypes.deletedAt),
        ),
      )
      .limit(1);
    if (!type) throw RatePlanErrors.roomTypeNotFound();
    return type;
  }

  private async requirePlan(propertyId: string, id: string): Promise<RatePlan> {
    const [row] = await this.db
      .select()
      .from(ratePlans)
      .where(
        and(
          eq(ratePlans.id, id),
          eq(ratePlans.propertyId, propertyId),
          isNull(ratePlans.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw RatePlanErrors.notFound();
    return row;
  }

  private async requireFee(propertyId: string, id: string): Promise<RoomTypeFee> {
    const [row] = await this.db
      .select()
      .from(roomTypeFees)
      .where(
        and(
          eq(roomTypeFees.id, id),
          eq(roomTypeFees.propertyId, propertyId),
          isNull(roomTypeFees.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw RatePlanErrors.feeNotFound();
    return row;
  }

  private async requirePricingRule(propertyId: string, id: string): Promise<PricingRule> {
    const [row] = await this.db
      .select()
      .from(pricingRules)
      .where(
        and(
          eq(pricingRules.id, id),
          eq(pricingRules.propertyId, propertyId),
          isNull(pricingRules.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw RatePlanErrors.pricingRuleNotFound();
    return row;
  }

  /** Pre-flight check so the common case gets a typed 409, not a raw 23505. */
  private async assertNameFree(roomTypeId: string, name: string, exceptId?: string) {
    const rows = await this.db
      .select({ id: ratePlans.id })
      .from(ratePlans)
      .where(
        and(
          eq(ratePlans.roomTypeId, roomTypeId),
          eq(ratePlans.name, name.trim()),
          isNull(ratePlans.deletedAt),
        ),
      )
      .limit(1);
    const clash = rows.find((r) => r.id !== exceptId);
    if (clash) throw RatePlanErrors.nameTaken(name);
  }

  private static validatePlan(dto: {
    name?: string;
    basePricePaise?: number | null;
    extraAdultPaise?: number | null;
    extraChildPaise?: number | null;
    extraInfantPaise?: number | null;
    minStay?: number | null;
    maxStay?: number | null;
    minAdvanceDays?: number | null;
    maxAdvanceDays?: number | null;
  }) {
    if (dto.name !== undefined && dto.name.trim().length === 0) {
      throw RatePlanErrors.invalid('name must not be empty');
    }
    if ((dto.basePricePaise ?? 0) < 0) {
      throw RatePlanErrors.invalid('basePricePaise must not be negative');
    }
    for (const key of ['extraAdultPaise', 'extraChildPaise', 'extraInfantPaise'] as const) {
      if ((dto[key] ?? 0) < 0) throw RatePlanErrors.invalid(`${key} must not be negative`);
    }
    if (dto.minStay != null && dto.minStay < 1) {
      throw RatePlanErrors.invalid('minStay must be at least 1');
    }
    if (dto.maxStay != null && dto.maxStay < 1) {
      throw RatePlanErrors.invalid('maxStay must be at least 1');
    }
    if (dto.minStay != null && dto.maxStay != null && dto.maxStay < dto.minStay) {
      throw RatePlanErrors.invalid('maxStay must not be less than minStay');
    }
    if (dto.minAdvanceDays != null && dto.minAdvanceDays < 0) {
      throw RatePlanErrors.invalid('minAdvanceDays must not be negative');
    }
    if (dto.maxAdvanceDays != null && dto.maxAdvanceDays < 0) {
      throw RatePlanErrors.invalid('maxAdvanceDays must not be negative');
    }
    if (
      dto.minAdvanceDays != null &&
      dto.maxAdvanceDays != null &&
      dto.maxAdvanceDays < dto.minAdvanceDays
    ) {
      throw RatePlanErrors.invalid('maxAdvanceDays must not be less than minAdvanceDays');
    }
  }

  /** A negative tax is not a thing; a negative pricing ADJUSTMENT is. */
  private static validateFee(calculation: RoomTypeFee['calculation'], value: number) {
    if (value < 0) throw RatePlanErrors.invalid('value must not be negative');
    if (calculation === 'PERCENT' && value > 100 * 100) {
      throw RatePlanErrors.invalid('a percent fee cannot exceed 10000 basis points (100%)');
    }
  }

  private static validateRule(startDate?: string, endDate?: string) {
    if (startDate && endDate && endDate < startDate) {
      throw RatePlanErrors.invalid('endDate must not be before startDate');
    }
  }

  // ---------- row -> dto ----------

  private static toPlanDto(row: RatePlan): RatePlanDto {
    return {
      id: row.id,
      roomTypeId: row.roomTypeId,
      name: row.name,
      basePricePaise: row.basePricePaise,
      currency: row.currency,
      mealPlan: row.mealPlan,
      cancellationPolicy: row.cancellationPolicy,
      cancellationNote: row.cancellationNote ?? null,
      paymentPolicy: row.paymentPolicy,
      minStay: row.minStay ?? null,
      maxStay: row.maxStay ?? null,
      minAdvanceDays: row.minAdvanceDays ?? null,
      maxAdvanceDays: row.maxAdvanceDays ?? null,
      extraAdultPaise: row.extraAdultPaise,
      extraChildPaise: row.extraChildPaise,
      extraInfantPaise: row.extraInfantPaise,
      status: row.status,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private static toFeeDto(row: RoomTypeFee): FeeDto {
    return {
      id: row.id,
      roomTypeId: row.roomTypeId,
      name: row.name,
      kind: row.kind,
      calculation: row.calculation,
      value: row.value,
      basis: row.basis,
      period: row.period,
      sortOrder: row.sortOrder,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private static toRuleDto(row: PricingRule): PricingRuleDto {
    return {
      id: row.id,
      roomTypeId: row.roomTypeId,
      trigger: row.trigger,
      comparator: row.comparator,
      threshold: row.threshold ?? null,
      startDate: row.startDate ?? null,
      endDate: row.endDate ?? null,
      adjustmentKind: row.adjustmentKind,
      adjustmentValue: row.adjustmentValue,
      enabled: row.enabled,
      priority: row.priority,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }
}

/** Re-exported so callers can use the pure quote without the Nest provider. */
export const previewPricing = RatePlansService.previewPricing;
