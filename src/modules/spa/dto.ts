import {
  IsBoolean,
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
import { Type } from 'class-transformer';
import {
  spaAppointmentStatusValues,
  spaPaymentMethodValues,
  spaServiceStatusValues,
} from '../../database/schema';

// ---------- Services ----------

export class ServiceQueryDto {
  /** Managers pass `all=true` to see ARCHIVED services too. */
  @IsOptional() @Type(() => Boolean) @IsBoolean() all?: boolean;
}

export class CreateServiceDto {
  @IsString() @Length(1, 160) name!: string;
  @IsOptional() @IsString() @Length(0, 2000) description?: string;
  @IsInt() @Min(1) @Max(1440) durationMinutes!: number;
  @IsInt() @Min(0) pricePaise!: number;
}

export class UpdateServiceDto {
  @IsOptional() @IsString() @Length(1, 160) name?: string;
  @IsOptional() @IsString() @Length(0, 2000) description?: string;
  @IsOptional() @IsInt() @Min(1) @Max(1440) durationMinutes?: number;
  @IsOptional() @IsInt() @Min(0) pricePaise?: number;
  @IsOptional() @IsIn(spaServiceStatusValues) status?: (typeof spaServiceStatusValues)[number];
}

// ---------- Appointments ----------

export class AppointmentFilterDto {
  @IsOptional()
  @IsIn(spaAppointmentStatusValues)
  status?: (typeof spaAppointmentStatusValues)[number];
  /** Spa staff pass `mine=true` to see only appointments assigned to them. */
  @IsOptional() @Type(() => Boolean) @IsBoolean() mine?: boolean;
  /** `YYYY-MM-DD` day filter (matches appointments starting that local day). */
  @IsOptional() @IsISO8601() day?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

export class CreateAppointmentDto {
  @IsString() @Length(1, 160) guestName!: string;
  @IsUUID() serviceId!: string;
  @IsISO8601() startAt!: string;
  @IsOptional() @IsUUID() reservationId?: string;
  @IsOptional() @IsUUID() staffId?: string;
  @IsOptional() @IsString() @Length(0, 2000) notes?: string;
}

export class UpdateAppointmentDto {
  @IsOptional() @IsString() @Length(1, 160) guestName?: string;
  @IsOptional() @IsISO8601() startAt?: string;
  @IsOptional() @IsString() @Length(0, 2000) notes?: string;
}

export class AssignTherapistDto {
  @IsUUID() staffId!: string;
}

export class AppointmentStatusDto {
  @IsIn(spaAppointmentStatusValues) status!: (typeof spaAppointmentStatusValues)[number];
}

export class AppointmentNotesDto {
  @IsString() @Length(1, 2000) notes!: string;
}

// ---------- Bills ----------

export class SettleBillDto {
  @IsIn(spaPaymentMethodValues) method!: (typeof spaPaymentMethodValues)[number];
  /** Required only for ROOM_CHARGE. */
  @IsOptional() @IsUUID() reservationId?: string;
}

export class RefundBillDto {
  @IsString() @Length(1, 500) reason!: string;
}
