import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  addonUnitValues,
  checkinModelValues,
  policyChargeKindValues,
  policyKindValues,
  taxAppliesToValues,
  taxBasisValues,
  taxCalculationValues,
} from '../../database/schema';
import { reservationSourceValues } from '../../database/schema';

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
/** 15 characters: 2 state digits, 10 PAN, entity digit, Z, checksum. */
const GSTIN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/;
const HEX_COLOR = /^#[0-9a-fA-F]{6}([0-9a-fA-F]{2})?$/;
const SLUG = /^[a-z0-9](?:[a-z0-9-]{1,78}[a-z0-9])?$/;

export class CheckinSlotDto {
  @IsString() @Length(1, 40) label!: string;
  @Matches(HHMM) start!: string;
  @Matches(HHMM) end!: string;
  @IsOptional() @IsInt() @Min(0) @Max(20_000) rateBp?: number;
}

/** Every field optional: the settings row is a single document patched in place. */
export class UpdatePropertySettingsDto {
  @IsOptional()
  @Matches(GSTIN, { message: 'gstin must be a valid 15-character GSTIN' })
  gstin?: string;
  @IsOptional() @Matches(/^\d{2}$/) gstStateCode?: string;
  @IsOptional() @IsBoolean() pricesIncludeTax?: boolean;

  @IsOptional() @IsString() @Length(1, 12) @Matches(/^[A-Z0-9-]+$/) invoicePrefix?: string;
  @IsOptional() @IsInt() @Min(1) invoiceNextNumber?: number;
  @IsOptional() @IsString() @Length(0, 2000) invoiceFooter?: string;
  @IsOptional() @IsBoolean() invoiceShowGstin?: boolean;
  @IsOptional() @IsBoolean() invoiceShowHsn?: boolean;
  @IsOptional() @IsBoolean() invoiceShowBreakup?: boolean;

  @IsOptional() @IsIn(checkinModelValues) checkinModel?: (typeof checkinModelValues)[number];
  @IsOptional() @Matches(HHMM) checkinTime?: string;
  @IsOptional() @Matches(HHMM) checkoutTime?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => CheckinSlotDto)
  slots?: CheckinSlotDto[];

  /** Minutes an unpaid enquiry hold survives. null clears it (holds never expire). */
  @IsOptional() @IsInt() @Min(5) @Max(43_200) holdExpiryMinutes?: number | null;

  @IsOptional() @IsBoolean() bookingEngineEnabled?: boolean;
  @IsOptional()
  @Matches(SLUG, { message: 'slug: lower-case letters, digits and hyphens' })
  bookingEngineSlug?: string;
  @IsOptional() @Matches(HEX_COLOR) brandColor?: string;
  @IsOptional() @IsString() @Length(0, 5000) bookingTerms?: string;

  @IsOptional() guestNotifications?: Record<string, Record<string, boolean>>;
  @IsOptional() hotelierNotifications?: Record<string, Record<string, boolean>>;

  @IsOptional() @IsString() @Length(3, 8) currency?: string;
}

export class TaxInputDto {
  @IsString() @Length(1, 80) name!: string;
  @IsOptional() @IsIn(taxCalculationValues) calculation?: (typeof taxCalculationValues)[number];
  /** Basis points for PERCENT (1250 = 12.5%); paise for FIXED. */
  @IsInt() @Min(0) @Max(100_000_000) value!: number;
  @IsOptional() @IsIn(taxBasisValues) basis?: (typeof taxBasisValues)[number];
  @IsOptional() @IsIn(taxAppliesToValues) appliesTo?: (typeof taxAppliesToValues)[number];
  @IsOptional() @IsString() @Length(0, 16) hsnCode?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateTaxDto {
  @IsOptional() @IsString() @Length(1, 80) name?: string;
  @IsOptional() @IsIn(taxCalculationValues) calculation?: (typeof taxCalculationValues)[number];
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) value?: number;
  @IsOptional() @IsIn(taxBasisValues) basis?: (typeof taxBasisValues)[number];
  @IsOptional() @IsIn(taxAppliesToValues) appliesTo?: (typeof taxAppliesToValues)[number];
  @IsOptional() @IsString() @Length(0, 16) hsnCode?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class PolicyInputDto {
  @IsIn(policyKindValues) kind!: (typeof policyKindValues)[number];
  @IsString() @Length(1, 80) name!: string;
  @IsOptional() @IsString() @Length(0, 2000) description?: string;
  /** Applies when the event is within this many hours of check-in. Omit = always. */
  @IsOptional() @IsInt() @Min(0) @Max(8760) hoursBefore?: number;
  @IsOptional() @IsIn(policyChargeKindValues) chargeKind?: (typeof policyChargeKindValues)[number];
  /** Basis points for PERCENT; paise for FIXED. */
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) value?: number;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdatePolicyDto {
  @IsOptional() @IsString() @Length(1, 80) name?: string;
  @IsOptional() @IsString() @Length(0, 2000) description?: string;
  @IsOptional() @IsInt() @Min(0) @Max(8760) hoursBefore?: number | null;
  @IsOptional() @IsIn(policyChargeKindValues) chargeKind?: (typeof policyChargeKindValues)[number];
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) value?: number;
  @IsOptional() @IsBoolean() isDefault?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class AddonInputDto {
  @IsString() @Length(1, 120) name!: string;
  @IsOptional() @IsString() @Length(0, 2000) description?: string;
  @IsInt() @Min(0) @Max(100_000_000) pricePaise!: number;
  @IsOptional() @IsIn(addonUnitValues) unit?: (typeof addonUnitValues)[number];
  @IsOptional() @IsIn(['accommodation', 'restaurant', 'other']) taxCategory?: string;
  @IsOptional() @IsString() @Length(0, 16) hsnCode?: string;
  @IsOptional() @IsBoolean() sellOnline?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateAddonDto {
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @IsString() @Length(0, 2000) description?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) pricePaise?: number;
  @IsOptional() @IsIn(addonUnitValues) unit?: (typeof addonUnitValues)[number];
  @IsOptional() @IsIn(['accommodation', 'restaurant', 'other']) taxCategory?: string;
  @IsOptional() @IsString() @Length(0, 16) hsnCode?: string;
  @IsOptional() @IsBoolean() sellOnline?: boolean;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class BookingSourceInputDto {
  @IsString() @Length(1, 80) name!: string;
  @IsOptional() @IsIn(reservationSourceValues) channel?: (typeof reservationSourceValues)[number];
  @IsOptional() @IsInt() @Min(0) @Max(10_000) commissionBp?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class UpdateBookingSourceDto {
  @IsOptional() @IsString() @Length(1, 80) name?: string;
  @IsOptional() @IsIn(reservationSourceValues) channel?: (typeof reservationSourceValues)[number];
  @IsOptional() @IsInt() @Min(0) @Max(10_000) commissionBp?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
  @IsOptional() @IsInt() @Min(0) sortOrder?: number;
}

export class CouponInputDto {
  @IsString() @Length(2, 40) @Matches(/^[A-Za-z0-9_-]+$/) code!: string;
  @IsOptional() @IsString() @Length(0, 200) description?: string;
  @IsOptional() @IsIn(['PERCENT', 'FIXED']) kind?: 'PERCENT' | 'FIXED';
  /** Basis points for PERCENT; paise for FIXED. */
  @IsInt() @Min(1) @Max(100_000_000) value!: number;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) validFrom?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) validTo?: string;
  @IsOptional() @IsInt() @Min(1) @Max(365) minNights?: number;
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000) maxUses?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

export class UpdateCouponDto {
  @IsOptional() @IsString() @Length(0, 200) description?: string;
  @IsOptional() @IsIn(['PERCENT', 'FIXED']) kind?: 'PERCENT' | 'FIXED';
  @IsOptional() @IsInt() @Min(1) @Max(100_000_000) value?: number;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) validFrom?: string | null;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) validTo?: string | null;
  @IsOptional() @IsInt() @Min(1) @Max(365) minNights?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(1_000_000) maxUses?: number | null;
  @IsOptional() @IsBoolean() isActive?: boolean;
}
