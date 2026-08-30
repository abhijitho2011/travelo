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
import {
  transportStatusValues,
  transportTypeValues,
  vehicleStatusValues,
} from '../../database/schema';
import { driverStepValues } from './transport-rules';

// ---------- Transport requests ----------

export class TransportFilterDto {
  @IsOptional() @IsIn(transportStatusValues) status?: (typeof transportStatusValues)[number];
  @IsOptional() @IsIn(transportTypeValues) type?: (typeof transportTypeValues)[number];
  /** ISO date; when present, only requests with a pickup on that calendar day. */
  @IsOptional() @IsISO8601() date?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

export class CreateTransportDto {
  @IsString() @Length(1, 200) guestName!: string;
  @IsOptional() @IsUUID() reservationId?: string;
  @IsIn(transportTypeValues) type!: (typeof transportTypeValues)[number];
  @IsISO8601() pickupAt!: string;
  @IsOptional() @IsString() @Length(1, 300) fromLocation?: string;
  @IsOptional() @IsString() @Length(1, 300) toLocation?: string;
  /** Paise, integer. */
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000_000) farePaise?: number;
  @IsOptional() @IsString() @Length(1, 2000) note?: string;
}

export class UpdateTransportDto {
  @IsOptional() @IsString() @Length(1, 200) guestName?: string;
  @IsOptional() @IsUUID() reservationId?: string;
  @IsOptional() @IsIn(transportTypeValues) type?: (typeof transportTypeValues)[number];
  @IsOptional() @IsISO8601() pickupAt?: string;
  @IsOptional() @IsString() @Length(0, 300) fromLocation?: string;
  @IsOptional() @IsString() @Length(0, 300) toLocation?: string;
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000_000) farePaise?: number;
  @IsOptional() @IsString() @Length(0, 2000) note?: string;
}

export class AssignTransportDto {
  @IsUUID() driverStaffId!: string;
  @IsOptional() @IsUUID() vehicleId?: string;
}

export class TransportStatusDto {
  @IsIn(transportStatusValues) status!: (typeof transportStatusValues)[number];
}

// ---------- Vehicles ----------

export class CreateVehicleDto {
  @IsString() @Length(1, 120) name!: string;
  @IsString() @Length(1, 32) plate!: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) seats?: number;
  @IsOptional() @IsIn(vehicleStatusValues) status?: (typeof vehicleStatusValues)[number];
}

export class UpdateVehicleDto {
  @IsOptional() @IsString() @Length(1, 120) name?: string;
  @IsOptional() @IsString() @Length(1, 32) plate?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) seats?: number;
  @IsOptional() @IsIn(vehicleStatusValues) status?: (typeof vehicleStatusValues)[number];
}

// ---------- Driver ----------

export class DriverStepDto {
  @IsIn(driverStepValues) step!: (typeof driverStepValues)[number];
}
