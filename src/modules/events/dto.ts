import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Min,
} from 'class-validator';
import { eventStatusValues } from '../../database/schema';

// ---------- Events ----------

export class EventFilterDto {
  @IsOptional() @IsIn(eventStatusValues) status?: (typeof eventStatusValues)[number];
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

export class CreateEventDto {
  @IsString() @Length(1, 200) name!: string;
  @IsString() @Length(1, 200) clientName!: string;
  @IsOptional() @IsString() @Length(0, 80) type?: string;
  @IsOptional() @IsString() @Length(0, 160) venue?: string;
  @IsISO8601() startAt!: string;
  @IsOptional() @IsISO8601() endAt?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) guestCount?: number;
  @IsOptional() @IsString() @Length(0, 120) package?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) revenuePaise?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) roomBlock?: number;
  @IsOptional() @IsString() @Length(0, 4000) notes?: string;
}

export class UpdateEventDto {
  @IsOptional() @IsString() @Length(1, 200) name?: string;
  @IsOptional() @IsString() @Length(1, 200) clientName?: string;
  @IsOptional() @IsString() @Length(0, 80) type?: string;
  @IsOptional() @IsString() @Length(0, 160) venue?: string;
  @IsOptional() @IsISO8601() startAt?: string;
  @IsOptional() @IsISO8601() endAt?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) guestCount?: number;
  @IsOptional() @IsString() @Length(0, 120) package?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) revenuePaise?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) roomBlock?: number;
  @IsOptional() @IsString() @Length(0, 4000) notes?: string;
}

export class EventStatusDto {
  @IsIn(eventStatusValues) status!: (typeof eventStatusValues)[number];
}

export class CancelEventDto {
  @IsOptional() @IsString() @Length(0, 500) reason?: string;
}

// ---------- Event tasks ----------

export class CreateEventTaskDto {
  @IsString() @Length(1, 200) title!: string;
  @IsOptional() @IsUUID() assigneeStaffId?: string;
  @IsOptional() @IsISO8601() dueAt?: string;
}

export class UpdateEventTaskDto {
  @IsOptional() @IsString() @Length(1, 200) title?: string;
  @IsOptional() @IsUUID() assigneeStaffId?: string;
  @IsOptional() @IsISO8601() dueAt?: string;
  @IsOptional() @IsBoolean() done?: boolean;
}
