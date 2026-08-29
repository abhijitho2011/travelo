import { IsIn, IsInt, IsOptional, IsString, IsUUID, Length, Min } from 'class-validator';
import { hotelStaffRoleValues, hotelStaffStatusValues } from '../../database/schema';
import { adminAssignableStaffStatusValues } from './staff.service';

/**
 * The global ValidationPipe runs with `transform` + `enableImplicitConversion`,
 * so the string query params arrive coerced to their declared types.
 */
export class StaffFilterDto {
  @IsOptional() @IsInt() @Min(0) offset?: number;
  @IsOptional() @IsInt() @Min(1) limit?: number;
  /** Matches property name OR staff name. */
  @IsOptional() @IsString() q?: string;
  /** Staff member's state (text name, resolved from the location dropdown). */
  @IsOptional() @IsString() state?: string;
  @IsOptional() @IsUUID() propertyId?: string;
  @IsOptional() @IsUUID() ownerId?: string;
  @IsOptional() @IsIn(hotelStaffRoleValues as unknown as string[]) role?: string;
  @IsOptional() @IsIn(hotelStaffStatusValues as unknown as string[]) status?: string;
}

export class SetStaffStatusAdminDto {
  @IsIn(adminAssignableStaffStatusValues as unknown as string[]) status!: string;
  /** Recorded verbatim on the audit entry so the change is explainable later. */
  @IsOptional() @IsString() @Length(1, 512) reason?: string;
}
