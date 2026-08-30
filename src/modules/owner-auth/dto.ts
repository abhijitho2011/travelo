import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import {
  ownerAssignableStaffStatusValues,
  ownerCreatableStaffRoleValues,
} from '../../database/schema/owner';
import { ticketPriorityValues, ticketStatusValues } from '../../database/schema/phase2';

const MOBILE_REGEX = /^[0-9]{10,15}$/;

export class RequestOtpDto {
  @IsString() @Matches(MOBILE_REGEX, { message: 'mobile must be 10-15 digits' }) mobile!: string;
}

export class VerifyOtpDto {
  @IsString() @Matches(MOBILE_REGEX, { message: 'mobile must be 10-15 digits' }) mobile!: string;
  @IsString() @Length(4, 8) otp!: string;
}

export class GoogleLoginDto {
  @IsString() @Length(10, 8192) idToken!: string;
}

export class RefreshDto {
  @IsString() @Length(10, 8192) refreshToken!: string;
}

/** A TOTP (or, for disable, a recovery code) supplied from the Security page. */
export class OwnerMfaCodeDto {
  @IsString() @Length(6, 32) code!: string;
}

/** The challenge token from first-factor sign-in plus the second factor. */
export class OwnerMfaChallengeDto {
  @IsString() @Length(10, 8192) mfaToken!: string;
  @IsString() @Length(6, 32) code!: string;
}

export class AddressDto {
  @IsString() @Length(1, 255) line1!: string;
  @IsString() @Length(1, 128) city!: string;
  // Required: the app picks it from the admin-managed location catalogue.
  @IsString() @Length(1, 128) district!: string;
  @IsString() @Length(1, 128) state!: string;
  @Matches(/^\d{6}$/, { message: 'pinCode must be exactly 6 digits' }) pinCode!: string;
  @IsOptional() @IsString() country?: string;
}

export class CreatePropertyDto {
  @IsString() @Length(2, 255) name!: string;
  @ValidateNested() @Type(() => AddressDto) address!: AddressDto;
  @IsString() @Length(1, 128) city!: string;
  @IsString() @Length(1, 128) state!: string;
  @IsString() @Matches(MOBILE_REGEX, { message: 'phone must be 10-15 digits' }) phone!: string;
  @IsOptional() @IsEmail() email?: string;
}

export class UpdatePropertyDto {
  @IsOptional() @IsString() @Length(2, 255) name?: string;
  @IsOptional() @ValidateNested() @Type(() => AddressDto) address?: AddressDto;
  @IsOptional() @IsString() @Length(1, 128) city?: string;
  @IsOptional() @IsString() @Length(1, 128) state?: string;
  @IsOptional()
  @IsString()
  @Matches(MOBILE_REGEX, { message: 'phone must be 10-15 digits' })
  phone?: string;
  @IsOptional() @IsEmail() email?: string;
}

export class CreateStaffDto {
  // Owners create hotel MANAGEMENT only. The full 23-role set exists for staff
  // created later by a GM inside the property — it must not widen this.
  @IsIn(ownerCreatableStaffRoleValues as unknown as string[]) role!: string;
  @IsString() @Length(1, 128) firstName!: string;
  @IsString() @Length(1, 128) lastName!: string;
  @IsOptional() @IsString() address?: string;
  @IsString() @Length(3, 12) pinCode!: string;
  @IsString() @Length(1, 128) state!: string;
  @IsString() @Length(1, 128) district!: string;
  @IsString() @Matches(MOBILE_REGEX, { message: 'mobile must be 10-15 digits' }) mobile!: string;
  @IsEmail() email!: string;
}

export class SetStaffStatusDto {
  @IsIn(ownerAssignableStaffStatusValues as unknown as string[]) status!: string;
}

/**
 * Partial edit of an existing GM/AGM. Every field is optional, but whatever is
 * supplied is validated exactly as it is on create — including the role, which
 * can only ever move between the two management roles an owner may assign.
 */
export class UpdateStaffDto {
  @IsOptional() @IsIn(ownerCreatableStaffRoleValues as unknown as string[]) role?: string;
  @IsOptional() @IsString() @Length(1, 128) firstName?: string;
  @IsOptional() @IsString() @Length(1, 128) lastName?: string;
  @IsOptional() @IsString() @Length(0, 500) address?: string;
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'pinCode must be exactly 6 digits' })
  pinCode?: string;
  @IsOptional() @IsString() @Length(1, 128) state?: string;
  @IsOptional() @IsString() @Length(1, 128) district?: string;
  // Normalised and range-checked by the service (10-digit Indian mobile).
  @IsOptional() @IsString() @Length(6, 20) mobile?: string;
  @IsOptional() @IsEmail() email?: string;
  @IsOptional() @IsString() @Length(0, 64) department?: string;
  @IsOptional() @IsString() @Length(0, 64) employeeId?: string;
}

/**
 * Self-service profile edit. `email` is declared ONLY so an attempt to change
 * it fails with the typed EMAIL_NOT_EDITABLE error rather than the global
 * whitelist pipe's generic "property should not exist" dump.
 */
export class UpdateOwnerProfileDto {
  @IsOptional() @IsString() @Length(2, 255) name?: string;
  @IsOptional() @IsString() @Length(0, 255) company?: string;
  @IsOptional() @IsString() @Length(6, 20) phone?: string;
  @IsOptional() @IsString() @Length(0, 32) gstNumber?: string;
  @IsOptional() @IsString() @Length(0, 500) address?: string;
  @IsOptional()
  @Matches(/^\d{6}$/, { message: 'pinCode must be exactly 6 digits' })
  pinCode?: string;
  /** `location_states.id` — validated against the admin catalogue when changed. */
  @IsOptional() @IsUUID() state?: string;
  /** `location_districts.id` — must belong to `state`. */
  @IsOptional() @IsUUID() district?: string;
  /** Never applied. Present so the rejection carries a readable reason. */
  @IsOptional() @IsString() email?: string;
}

// ---------- Support ----------

export class CreateTicketDto {
  @IsString() @Length(3, 255) subject!: string;
  @IsString() @Length(1, 5000) message!: string;
  @IsOptional() @IsIn(ticketPriorityValues as unknown as string[]) priority?: string;
  @IsOptional() @IsUUID() propertyId?: string;
}

export class TicketMessageDto {
  @IsString() @Length(1, 5000) body!: string;
}

export class TicketFilterDto {
  @IsOptional() @IsIn(ticketStatusValues as unknown as string[]) status?: string;
  @IsOptional() @IsString() @Length(1, 128) q?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsInt() @Min(0) offset?: number;
}

export class PaginationDto {
  @IsOptional() @IsInt() @Min(1) @Max(100) limit?: number;
  @IsOptional() @IsInt() @Min(0) offset?: number;
}

export class CreateSubscriptionOrderDto {
  /** Which gateway to raise the order with. Defaults to RAZORPAY server-side. */
  @IsOptional() @IsIn(['RAZORPAY', 'CASHFREE']) gateway?: 'RAZORPAY' | 'CASHFREE';
}
