import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
} from 'class-validator';
import { leadStageValues, salesActivityTypeValues } from '../../database/schema';

export class LeadFilterDto {
  @IsOptional() @IsIn(leadStageValues) stage?: (typeof leadStageValues)[number];
  @IsOptional() @IsUUID() ownerStaffId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

export class CreateLeadDto {
  @IsString() @Length(1, 200) name!: string;
  @IsOptional() @IsString() @Length(1, 200) company?: string;
  @IsOptional() @IsString() @Length(1, 120) contact?: string;
  @IsOptional() @IsString() @Length(1, 64) source?: string;
  /** Estimated deal value, integer paise. */
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000_000_000) valuePaise?: number;
  @IsOptional() @IsUUID() ownerStaffId?: string;
  @IsOptional() @IsString() @Length(1, 4000) notes?: string;
}

export class UpdateLeadDto {
  @IsOptional() @IsString() @Length(1, 200) name?: string;
  @IsOptional() @IsString() @Length(0, 200) company?: string;
  @IsOptional() @IsString() @Length(0, 120) contact?: string;
  @IsOptional() @IsString() @Length(0, 64) source?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000_000_000) valuePaise?: number;
  @IsOptional() @IsUUID() ownerStaffId?: string;
  @IsOptional() @IsString() @Length(0, 4000) notes?: string;
}

export class MoveStageDto {
  @IsIn(leadStageValues) stage!: (typeof leadStageValues)[number];
}

export class CreateActivityDto {
  @IsIn(salesActivityTypeValues) type!: (typeof salesActivityTypeValues)[number];
  @IsOptional() @IsString() @Length(1, 4000) note?: string;
  @IsOptional() @IsISO8601() at?: string;
}
