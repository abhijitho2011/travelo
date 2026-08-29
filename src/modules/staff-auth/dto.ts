import {
  IsBoolean,
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Min,
} from 'class-validator';
import { hotelStaffRoleValues } from '../../database/schema';
import { staffCreatableRoleValues } from './role-creation';

const MOBILE_REGEX = /^[0-9]{10,15}$/;

export class StaffRequestOtpDto {
  @IsString() @Matches(MOBILE_REGEX, { message: 'mobile must be 10-15 digits' }) mobile!: string;
}

export class StaffVerifyOtpDto {
  @IsString() @Matches(MOBILE_REGEX, { message: 'mobile must be 10-15 digits' }) mobile!: string;
  @IsString() @Length(4, 8) otp!: string;
}

export class StaffGoogleLoginDto {
  @IsString() @Length(10, 8192) idToken!: string;
}

export class StaffRefreshDto {
  @IsString() @Length(10, 8192) refreshToken!: string;
}

/**
 * Roles SOMEBODY inside the property may create — the outer bound the DTO
 * validates against. GENERAL_MANAGER and ASSISTANT_GENERAL_MANAGER are
 * excluded: hotel management is appointed by the OWNER, so no staff member can
 * mint a peer or a superior for themselves.
 *
 * It is deliberately NOT the per-actor answer. `creatableRolesFor(me.role)` in
 * `role-creation.ts` narrows it further (HR may not create HR), and
 * `StaffTeamService.create` enforces that narrower set.
 */
export { staffCreatableRoleValues };

/** Statuses a GM/AGM may set on a team member. */
export const staffAssignableStatusValues = [
  'ACTIVE',
  'BLOCKED',
  'SUSPENDED',
  'DEACTIVATED',
] as const;

export class StaffTeamFilterDto {
  @IsOptional() @IsInt() @Min(0) offset?: number;
  @IsOptional() @IsInt() @Min(1) limit?: number;
  /** Matches first name, last name, full name or email. */
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsIn(hotelStaffRoleValues as unknown as string[]) role?: string;
  @IsOptional()
  @IsIn([
    'INVITED',
    'PENDING_APPROVAL',
    'APPROVED',
    'ACTIVE',
    'BLOCKED',
    'SUSPENDED',
    'DEACTIVATED',
  ])
  status?: string;
  @IsOptional() @IsString() department?: string;
}

export class CreateTeamMemberDto {
  @IsIn(staffCreatableRoleValues as unknown as string[]) role!: string;
  @IsString() @Length(1, 128) firstName!: string;
  @IsString() @Length(1, 128) lastName!: string;
  @IsString() @Matches(MOBILE_REGEX, { message: 'mobile must be 10-15 digits' }) mobile!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() @Length(1, 64) department?: string;
  @IsOptional() @IsString() @Length(1, 64) employeeId?: string;
  @IsOptional() @IsString() address?: string;
  @IsOptional() @IsString() @Length(3, 12) pinCode?: string;
  @IsOptional() @IsString() @Length(1, 128) state?: string;
  @IsOptional() @IsString() @Length(1, 128) district?: string;
  /** Honoured only when the creator holds `staff.approve`; otherwise ignored. */
  @IsOptional() @IsBoolean() activate?: boolean;
}

export class SetTeamMemberStatusDto {
  @IsIn(staffAssignableStatusValues as unknown as string[]) status!: string;
}
