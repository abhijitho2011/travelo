import { Type } from 'class-transformer';
import {
  IsBoolean,
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
import {
  folioPaymentDirectionValues,
  folioPaymentMethodValues,
  reservationSourceValues,
  reservationStatusValues,
  type FolioPaymentDirection,
  type FolioPaymentMethod,
} from '../../database/schema';

/** `YYYY-MM-DD`. The one date shape this module accepts — see reservation-rules. */
const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;
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

  /** Optional: tie this stay to a group booking. */
  @IsOptional() @IsUUID() groupId?: string;

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

  /** The rate plan sold (EP/CP/MAP…). Omitted means a flat nightly rate. */
  @IsOptional() @IsUUID() ratePlanId?: string;

  /** The hotel-defined finer source; `source` stays the coarse channel. */
  @IsOptional() @IsUUID() bookingSourceId?: string;

  @IsOptional() @IsString() @Length(1, 32) segment?: string;

  @IsOptional() @IsString() @Length(1, 64) subSegment?: string;

  /**
   * An enquiry hold: keep it PENDING for this many minutes, then expire it
   * unless confirmed. Omitted → the property's default; 0 → never expires.
   */
  @IsOptional() @IsInt() @Min(0) @Max(43_200) holdMinutes?: number;

  /** Actual arrival/departure times for slot-based properties (HH:MM). */
  @IsOptional() @Matches(HHMM) checkinTime?: string;

  @IsOptional() @Matches(HHMM) checkoutTime?: string;

  /** Company details that print on the invoice for a corporate stay. */
  @IsOptional() @IsString() @Length(1, 160) companyName?: string;

  @IsOptional() @IsString() @Length(15, 15) companyGstin?: string;

  @IsOptional() @IsString() @Length(0, 1000) companyAddress?: string;

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

  @IsOptional() @IsUUID() ratePlanId?: string;

  @IsOptional() @IsUUID() bookingSourceId?: string;

  @IsOptional() @IsString() @Length(1, 32) segment?: string;

  @IsOptional() @IsString() @Length(1, 64) subSegment?: string;

  @IsOptional() @IsBoolean() scantyBaggage?: boolean;

  @IsOptional() @Matches(HHMM) checkinTime?: string;

  @IsOptional() @Matches(HHMM) checkoutTime?: string;

  @IsOptional() @IsString() @Length(1, 160) companyName?: string;

  @IsOptional() @IsString() @Length(15, 15) companyGstin?: string;

  @IsOptional() @IsString() @Length(0, 1000) companyAddress?: string;
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
  /** Paise collected at departure — recorded as a folio payment. */
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) collectedPaise?: number;

  /** How that money came in. Defaults to CASH. */
  @IsOptional() @IsIn(folioPaymentMethodValues) paymentMethod?: FolioPaymentMethod;

  /** Receipt/txn reference for the collected payment. */
  @IsOptional() @IsString() @Length(0, 120) reference?: string;

  /**
   * Explicit override: check the guest out even though the folio still shows an
   * outstanding balance (bill-to-company, dispute, comp). Recorded on the event.
   */
  @IsOptional() @IsBoolean() allowOutstanding?: boolean;

  /** Idempotency for the collected payment — a double-tap never charges twice. */
  @IsOptional() @IsString() @Length(1, 80) idempotencyKey?: string;

  @IsOptional() @IsString() @Length(0, 500) note?: string;
}

export class CollectPaymentDto {
  @IsIn(folioPaymentMethodValues) method!: FolioPaymentMethod;

  /** Paise, always positive; `direction` carries the sign. */
  @IsInt() @Min(1) @Max(100_000_000) amountPaise!: number;

  /** PAYMENT (default) collects; REFUND returns money to the guest. */
  @IsOptional() @IsIn(folioPaymentDirectionValues) direction?: FolioPaymentDirection;

  @IsOptional() @IsString() @Length(0, 120) reference?: string;

  @IsOptional() @IsString() @Length(0, 500) note?: string;

  @IsOptional() @IsString() @Length(1, 80) idempotencyKey?: string;
}

export class ExtendStayDto {
  /** New check-out, must be LATER than the current one. EXCLUSIVE, as ever. */
  @Matches(ISO_DATE, { message: `checkOut ${DATE_MESSAGE}` }) checkOut!: string;

  /** Optional new per-night rate; otherwise the existing rate carries forward. */
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) ratePaise?: number;
}

export class MoveRoomDto {
  @IsUUID() roomId!: string;

  /** Re-quote for a different room type; defaults to the new type's base rate. */
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) ratePaise?: number;
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

/** Pin or release a booking from its room. Pinned bookings never auto-move. */
export class LockRoomDto {
  @IsBoolean() locked!: boolean;
}

/** Swap the rooms of two bookings for their overlapping nights. */
export class SwapRoomsDto {
  @IsUUID() otherReservationId!: string;
}

/**
 * Auto-allocate: place every unassigned CONFIRMED arrival in a date window
 * into a free room of its type. Dry-run reports the plan without writing.
 */
export class AutoAllocateDto {
  @Matches(ISO_DATE, { message: `from ${DATE_MESSAGE}` }) from!: string;
  @Matches(ISO_DATE, { message: `to ${DATE_MESSAGE}` }) to!: string;
  @IsOptional() @IsBoolean() dryRun?: boolean;
}
