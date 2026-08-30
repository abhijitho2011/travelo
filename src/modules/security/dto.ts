import { IsIn, IsISO8601, IsOptional, IsString, IsUUID, Length } from 'class-validator';
import {
  gateMovementValues,
  incidentSeverityValues,
  incidentStatusValues,
  lostFoundStatusValues,
} from '../../database/schema';

// ---------- Gate log ----------

export class GateLogQueryDto {
  /** `vehicle` narrows the feed to VEHICLE_IN/VEHICLE_OUT, as the app's vehicle screen does. */
  @IsOptional() @IsString() kind?: string;
}

export class RecordGateMovementDto {
  @IsIn(gateMovementValues) movement!: (typeof gateMovementValues)[number];
  @IsString() @Length(1, 200) subject!: string;
  @IsOptional() @IsString() @Length(0, 2000) detail?: string;
}

// ---------- Visitors ----------

export class RecordVisitorDto {
  @IsString() @Length(1, 160) name!: string;
  @IsOptional() @IsString() @Length(0, 200) visiting?: string;
  @IsOptional() @IsString() @Length(0, 200) purpose?: string;
  @IsOptional() @IsString() @Length(0, 64) passNumber?: string;
}

// ---------- Lost & found ----------

export class RecordLostFoundDto {
  @IsString() @Length(1, 2000) description!: string;
  @IsOptional() @IsString() @Length(0, 200) location?: string;
}

export class UpdateLostFoundDto {
  @IsIn(lostFoundStatusValues) status!: (typeof lostFoundStatusValues)[number];
}

// ---------- Incidents ----------

export class IncidentFilterDto {
  @IsOptional() @IsIn(incidentStatusValues) status?: (typeof incidentStatusValues)[number];
}

export class ReportIncidentDto {
  @IsString() @Length(1, 2000) summary!: string;
  @IsIn(incidentSeverityValues) severity!: (typeof incidentSeverityValues)[number];
  @IsOptional() @IsString() @Length(0, 200) location?: string;
}

export class AssignIncidentDto {
  @IsUUID() staffId!: string;
}

export class ResolveIncidentDto {
  @IsString() @Length(1, 2000) resolution!: string;
}

// ---------- Shifts ----------

export class ShiftFilterDto {
  @IsOptional() @IsString() status?: string;
}

export class CreateShiftDto {
  @IsUUID() staffId!: string;
  @IsString() @Length(1, 120) area!: string;
  @IsISO8601() startAt!: string;
  @IsOptional() @IsISO8601() endAt?: string;
}

export class UpdateShiftStatusDto {
  @IsString() status!: string;
}
