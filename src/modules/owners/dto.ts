import {
  IsDateString,
  IsEmail,
  IsIn,
  IsInt,
  IsObject,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Min,
} from 'class-validator';
import { ownerStatusValues } from '../../database/schema/phase2';

/** 15-character GSTIN, e.g. 29ABCDE1234F1Z5. */
export const GSTIN_PATTERN = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/;

export class CreateOwnerDto {
  @IsString() @Length(2, 255) name!: string;
  @IsEmail() email!: string;
  @IsString() @Length(1, 64) phone!: string;
  @IsString() @Length(2, 255) company!: string;
  @IsString() @Length(3, 500) address!: string;
  @Matches(/^\d{6}$/, { message: 'pinCode must be exactly 6 digits' }) pinCode!: string;
  /** `location_states.id` — validated against the admin-managed catalogue. */
  @IsUUID() state!: string;
  /** `location_districts.id` — must belong to `state`. */
  @IsUUID() district!: string;
  @IsOptional() @IsString() gstNumber?: string;
  @IsOptional() @IsString() country?: string;
  /**
   * Mandatory: an owner can never exist without a subscription, so the plan is
   * chosen up front and the subscription is created in the same transaction.
   */
  // Optional to class-validator only so a missing plan surfaces as the typed
  // PLAN_REQUIRED error from the service rather than a generic validation dump.
  @IsOptional() @IsUUID() planId?: string;
  @IsOptional() @IsDateString() startsAt?: string;
}

export class DeleteOwnerDto {
  @IsOptional() @IsString() reason?: string;
}

export class UpdateOwnerDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() gstNumber?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsObject() address?: Record<string, unknown>;
}

export class SetOwnerStatusDto {
  @IsOptional() @IsString() reason?: string;
}

export class OwnerFilterDto {
  @IsOptional() @IsInt() @Min(0) offset?: number;
  @IsOptional() @IsInt() @Min(1) limit?: number;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsIn(ownerStatusValues as unknown as string[]) status?: string;
}
