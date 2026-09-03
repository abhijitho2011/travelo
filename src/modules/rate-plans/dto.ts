import { Type } from 'class-transformer';
import {
  Max,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
} from 'class-validator';
import {
  adjustmentKindValues,
  cancellationPolicyValues,
  feeBasisValues,
  feeCalculationValues,
  feeKindValues,
  feePeriodValues,
  mealPlanValues,
  paymentPolicyValues,
  pricingComparatorValues,
  pricingTriggerValues,
  ratePlanStatusValues,
  type AdjustmentKind,
  type CancellationPolicy,
  type FeeBasis,
  type FeeCalculation,
  type FeeKind,
  type FeePeriod,
  type MealPlan,
  type PaymentPolicy,
  type PricingComparator,
  type PricingTrigger,
  type RatePlanStatus,
} from '../../database/schema/rate-plans';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

// ---------- Rate plans ----------

export class CreateRatePlanDto {
  @IsUUID() roomTypeId!: string;
  @IsString() @Length(1, 120) name!: string;
  @IsOptional() @IsInt() @Min(0) basePricePaise?: number;
  @IsOptional() @IsString() @Length(1, 8) currency?: string;
  @IsOptional() @IsIn(mealPlanValues as unknown as string[]) mealPlan?: MealPlan;
  @IsOptional()
  @IsIn(cancellationPolicyValues as unknown as string[])
  cancellationPolicy?: CancellationPolicy;
  @IsOptional() @IsString() @Length(1, 2000) cancellationNote?: string;
  @IsOptional() @IsIn(paymentPolicyValues as unknown as string[]) paymentPolicy?: PaymentPolicy;
  @IsOptional() @IsInt() minStay?: number;
  @IsOptional() @IsInt() maxStay?: number;
  @IsOptional() @IsInt() minAdvanceDays?: number;
  @IsOptional() @IsInt() maxAdvanceDays?: number;
  @IsOptional() @IsInt() extraAdultPaise?: number;
  @IsOptional() @IsInt() extraChildPaise?: number;
  @IsOptional() @IsInt() extraInfantPaise?: number;
  @IsOptional() @IsIn(ratePlanStatusValues as unknown as string[]) status?: RatePlanStatus;
  @IsOptional() @IsInt() sortOrder?: number;
}

/** Every field optional; only what is sent is written. */
export class UpdateRatePlanDto {
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @IsInt() basePricePaise?: number;
  @IsOptional() @IsString() @Length(1, 8) currency?: string;
  @IsOptional() @IsIn(mealPlanValues as unknown as string[]) mealPlan?: MealPlan;
  @IsOptional()
  @IsIn(cancellationPolicyValues as unknown as string[])
  cancellationPolicy?: CancellationPolicy;
  @IsOptional() @IsString() @Length(0, 2000) cancellationNote?: string;
  @IsOptional() @IsIn(paymentPolicyValues as unknown as string[]) paymentPolicy?: PaymentPolicy;
  @IsOptional() @IsInt() minStay?: number;
  @IsOptional() @IsInt() maxStay?: number;
  @IsOptional() @IsInt() minAdvanceDays?: number;
  @IsOptional() @IsInt() maxAdvanceDays?: number;
  @IsOptional() @IsInt() extraAdultPaise?: number;
  @IsOptional() @IsInt() extraChildPaise?: number;
  @IsOptional() @IsInt() extraInfantPaise?: number;
  @IsOptional() @IsIn(ratePlanStatusValues as unknown as string[]) status?: RatePlanStatus;
  @IsOptional() @IsInt() sortOrder?: number;
}

export class SetRatePlanStatusDto {
  @IsIn(ratePlanStatusValues as unknown as string[]) status!: RatePlanStatus;
}

export class ListRatePlansQueryDto {
  @IsOptional() @IsUUID() roomTypeId?: string;
}

// ---------- Fees ----------

export class CreateFeeDto {
  @IsString() @Length(1, 120) name!: string;
  @IsOptional() @IsIn(feeKindValues as unknown as string[]) kind?: FeeKind;
  @IsOptional() @IsIn(feeCalculationValues as unknown as string[]) calculation?: FeeCalculation;
  /** Basis points when PERCENT, paise when FIXED. */
  @IsInt() @Type(() => Number) value!: number;
  @IsOptional() @IsIn(feeBasisValues as unknown as string[]) basis?: FeeBasis;
  @IsOptional() @IsIn(feePeriodValues as unknown as string[]) period?: FeePeriod;
  @IsOptional() @IsInt() sortOrder?: number;
}

export class UpdateFeeDto {
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @IsIn(feeKindValues as unknown as string[]) kind?: FeeKind;
  @IsOptional() @IsIn(feeCalculationValues as unknown as string[]) calculation?: FeeCalculation;
  @IsOptional() @IsInt() value?: number;
  @IsOptional() @IsIn(feeBasisValues as unknown as string[]) basis?: FeeBasis;
  @IsOptional() @IsIn(feePeriodValues as unknown as string[]) period?: FeePeriod;
  @IsOptional() @IsInt() sortOrder?: number;
}

// ---------- Pricing rules ----------

export class CreatePricingRuleDto {
  @IsOptional() @IsString() @Length(1, 80) name?: string;
  @IsIn(pricingTriggerValues as unknown as string[]) trigger!: PricingTrigger;
  @IsOptional()
  @IsIn(pricingComparatorValues as unknown as string[])
  comparator?: PricingComparator;
  @IsOptional() @IsInt() threshold?: number;
  @IsOptional() @Matches(ISO_DATE) startDate?: string;
  @IsOptional() @Matches(ISO_DATE) endDate?: string;
  @IsOptional() @IsIn(adjustmentKindValues as unknown as string[]) adjustmentKind?: AdjustmentKind;
  /** Basis points for PERCENT, paise for FIXED; negative = discount. */
  @IsInt() adjustmentValue!: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsInt() priority?: number;
}

export class UpdatePricingRuleDto {
  @IsOptional() @IsString() @Length(1, 80) name?: string;
  @IsOptional() @IsIn(pricingTriggerValues as unknown as string[]) trigger?: PricingTrigger;
  @IsOptional()
  @IsIn(pricingComparatorValues as unknown as string[])
  comparator?: PricingComparator;
  @IsOptional() @IsInt() threshold?: number;
  @IsOptional() @Matches(ISO_DATE) startDate?: string;
  @IsOptional() @Matches(ISO_DATE) endDate?: string;
  @IsOptional() @IsIn(adjustmentKindValues as unknown as string[]) adjustmentKind?: AdjustmentKind;
  @IsOptional() @IsInt() adjustmentValue?: number;
  @IsOptional() @IsBoolean() enabled?: boolean;
  @IsOptional() @IsInt() priority?: number;
}

export class RunRulesDto {
  @IsOptional() @IsInt() @Min(1) @Max(400) days?: number;
  @IsOptional() @IsBoolean() dryRun?: boolean;
}
