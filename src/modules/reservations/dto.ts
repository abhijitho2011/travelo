import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
} from 'class-validator';
import { reservationSourceValues, reservationStatusValues } from '../../database/schema';

/** `YYYY-MM-DD`. The one date shape this module accepts — see reservation-rules. */
const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;
const DATE_MESSAGE = 'must be a date in YYYY-MM-DD form';

export class ReservationFilterDto {
  @IsOptional() @IsIn(reservationStatusValues) status?: (typeof reservationStatusValues)[number];

  /** Inclusive lower bound on the stay window. */
  @IsOptional() @Matches(ISO_DATE, { message: `from ${DATE_MESSAGE}` }) from?: string;

  @IsOptional() @Matches(ISO_DATE, { message: `to ${DATE_MESSAGE}` }) to?: string;

  /** Guest name, phone, or reservation number. */
  @IsOptional() @IsString() @Length(1, 160) q?: string;

  @IsOptional() @IsUUID() roomId?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

export class CreateReservationDto {
  @IsUUID() roomTypeId!: string;

  /** Optional at booking time — reception usually picks the room at arrival. */
  @IsOptional() @IsUUID() roomId?: string;

  @IsString() @Length(2, 160) guestName!: string;

  @IsString() @Length(6, 32) guestPhone!: string;

  @IsOptional() @IsString() @Length(3, 254) guestEmail?: string;

  @IsOptional() @IsString() @Length(1, 32) guestIdType?: string;

  @IsOptional() @IsString() @Length(1, 64) guestIdNumber?: string;

  @IsInt() @Min(1) @Max(50) adults!: number;

  @IsOptional() @IsInt() @Min(0) @Max(50) children?: number;

  @Matches(ISO_DATE, { message: `checkIn ${DATE_MESSAGE}` }) checkIn!: string;

  /** EXCLUSIVE — the morning the room frees up. */
  @Matches(ISO_DATE, { message: `checkOut ${DATE_MESSAGE}` }) checkOut!: string;

  /** Paise per night. Omitted means "use the room type's base rate". */
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) ratePaise?: number;

  @IsOptional() @IsIn(reservationSourceValues) source?: (typeof reservationSourceValues)[number];

  @IsOptional() @IsString() @Length(0, 2000) notes?: string;

  /**
   * Book straight into CONFIRMED. A walk-in at the desk is never a soft hold —
   * making reception press "create" then "confirm" for every arrival is the
   * kind of friction that gets a PMS abandoned.
   */
  @IsOptional() @IsIn(['PENDING', 'CONFIRMED']) status?: 'PENDING' | 'CONFIRMED';
}

export class UpdateReservationDto {
  @IsOptional() @IsString() @Length(2, 160) guestName?: string;

  @IsOptional() @IsString() @Length(6, 32) guestPhone?: string;

  @IsOptional() @IsString() @Length(3, 254) guestEmail?: string;

  @IsOptional() @IsString() @Length(1, 32) guestIdType?: string;

  @IsOptional() @IsString() @Length(1, 64) guestIdNumber?: string;

  @IsOptional() @IsInt() @Min(1) @Max(50) adults?: number;

  @IsOptional() @IsInt() @Min(0) @Max(50) children?: number;

  /** Moving dates re-runs the availability check; refused after check-in. */
  @IsOptional() @Matches(ISO_DATE, { message: `checkIn ${DATE_MESSAGE}` }) checkIn?: string;

  @IsOptional() @Matches(ISO_DATE, { message: `checkOut ${DATE_MESSAGE}` }) checkOut?: string;

  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) ratePaise?: number;

  @IsOptional() @IsIn(reservationSourceValues) source?: (typeof reservationSourceValues)[number];

  @IsOptional() @IsString() @Length(0, 2000) notes?: string;
}

export class AssignRoomDto {
  @IsUUID() roomId!: string;
}

export class CheckInDto {
  /** Optional: assign the room in the same call the guest arrives. */
  @IsOptional() @IsUUID() roomId?: string;

  @IsOptional() @IsString() @Length(1, 32) guestIdType?: string;

  @IsOptional() @IsString() @Length(1, 64) guestIdNumber?: string;
}

export class CheckOutDto {
  /** Paise collected at departure, added to `paidPaise`. */
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) collectedPaise?: number;

  @IsOptional() @IsString() @Length(0, 500) note?: string;
}

export class CancelReservationDto {
  /** Required. A cancellation without a stated reason is unauditable. */
  @IsString() @Length(3, 500) reason!: string;
}

export class NoShowDto {
  @IsOptional() @IsString() @Length(0, 500) note?: string;
}

export class AvailabilityQueryDto {
  @Matches(ISO_DATE, { message: `checkIn ${DATE_MESSAGE}` }) checkIn!: string;

  @Matches(ISO_DATE, { message: `checkOut ${DATE_MESSAGE}` }) checkOut!: string;

  /** Narrow to one type; omitted returns every ACTIVE type at the property. */
  @IsOptional() @IsUUID() roomTypeId?: string;
}
