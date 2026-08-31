import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayNotEmpty,
  IsArray,
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
  ArrayMinSize,
  ValidateNested,
} from 'class-validator';
import {
  amenityScopeValues,
  amenityStatusValues,
  bedTypeValues,
  roomStatusValues,
  roomTypePhotoCategoryValues,
  roomTypeStatusValues,
  sizeUnitValues,
  smokingPolicyValues,
  unitKindValues,
} from '../../database/schema';

/** Hard ceiling on one bulk create — a floor, not a whole chain. */
export const MAX_BULK_ROOMS = 200;

// ---------- Amenity catalogue (admin) ----------

export class CreateAmenityDto {
  /** Slug: lower-case, digits and underscores. The stable identity. */
  @IsString()
  @Length(2, 64)
  @Matches(/^[a-z][a-z0-9_]*$/, {
    message: 'key must be a lower-case slug, e.g. "sea_view"',
  })
  key!: string;

  @IsString() @Length(1, 128) name!: string;

  @IsIn(amenityScopeValues) scope!: (typeof amenityScopeValues)[number];

  @IsOptional() @IsString() @Length(1, 64) icon?: string;

  @IsOptional() @IsInt() @Min(0) @Max(10_000) sortOrder?: number;
}

export class UpdateAmenityDto {
  @IsOptional() @IsString() @Length(1, 128) name?: string;

  @IsOptional() @IsIn(amenityScopeValues) scope?: (typeof amenityScopeValues)[number];

  @IsOptional() @IsString() @Length(1, 64) icon?: string;

  @IsOptional() @IsInt() @Min(0) @Max(10_000) sortOrder?: number;

  @IsOptional() @IsIn(amenityStatusValues) status?: (typeof amenityStatusValues)[number];
}

export class AmenityFilterDto {
  @IsOptional() @IsIn(amenityScopeValues) scope?: (typeof amenityScopeValues)[number];

  @IsOptional() @IsIn(amenityStatusValues) status?: (typeof amenityStatusValues)[number];

  @IsOptional() @IsString() @Length(1, 128) q?: string;
}

// ---------- Room types ----------

/**
 * One row of the sleeping arrangement. Sent as an ordered array; the FIRST
 * entry is the primary bed and is what `room_types.bed_type` / `bed_count` get
 * synced from, so existing readers of that pair keep working.
 */
export class RoomTypeBedDto {
  @IsIn(bedTypeValues) bedType!: (typeof bedTypeValues)[number];

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) quantity?: number;
}

/**
 * Everything the room-type form collects beyond name/rate. EVERY field is
 * optional on both create and update: the villa fields and the original
 * required set keep working untouched, and a client that knows nothing about
 * these columns keeps sending exactly what it sent before.
 */
class RoomTypeDetailFieldsDto {
  /** Internal code ("DLX-KING"). Unique per hotel when set. */
  @IsOptional() @IsString() @Length(1, 32) code?: string;

  @IsOptional() @IsString() @Length(1, 64) floorLabel?: string;

  @IsOptional() @IsIn(smokingPolicyValues) smokingPolicy?: (typeof smokingPolicyValues)[number];

  @IsOptional() @IsBoolean() accessible?: boolean;

  /** Size AS TYPED. The server converts to `sizeSqft`, which stays canonical. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1_000_000) sizeValue?: number;

  @IsOptional() @IsIn(sizeUnitValues) sizeUnit?: (typeof sizeUnitValues)[number];

  /** Guests included in the base rate. Must be <= maxOccupancy. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(50) baseOccupancy?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(50) maxInfants?: number;

  @IsOptional() @IsBoolean() extraBedAvailable?: boolean;

  @IsOptional() @IsIn(bedTypeValues) extraBedType?: (typeof bedTypeValues)[number];

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(20) extraBedCapacity?: number;

  /** Paise. 0 means "free extra bed", not "unpriced". */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100_000_000) extraBedPricePaise?: number;

  @IsOptional() @IsBoolean() dynamicPricingEnabled?: boolean;

  @IsOptional() @IsBoolean() pricesIncludeTax?: boolean;

  /** Present = REPLACE the whole arrangement. Absent = leave it untouched. */
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(12)
  @ValidateNested({ each: true })
  @Type(() => RoomTypeBedDto)
  beds?: RoomTypeBedDto[];
}

export class RoomTypeInputDto extends RoomTypeDetailFieldsDto {
  @IsString() @Length(1, 128) name!: string;

  @IsOptional() @IsString() @Length(0, 2000) description?: string;

  /** ROOM (default) or VILLA — what one bookable unit of this type is. */
  @IsOptional() @IsIn(unitKindValues) unitKind?: (typeof unitKindValues)[number];

  /** Rooms inside ONE unit — 1 for a room, 1+ for a multi-room villa. */
  @IsOptional() @IsInt() @Min(1) @Max(20) unitRoomCount?: number;

  /** Each unit has its own private pool (the shared pool stays a PROPERTY amenity). */
  @IsOptional() @IsBoolean() privatePool?: boolean;

  @IsIn(bedTypeValues) bedType!: (typeof bedTypeValues)[number];

  @IsInt() @Min(1) @Max(20) bedCount!: number;

  @IsInt() @Min(1) @Max(50) maxOccupancy!: number;

  @IsInt() @Min(1) @Max(50) maxAdults!: number;

  @IsInt() @Min(0) @Max(50) maxChildren!: number;

  /**
   * Air conditioning lives here, NOT in the amenity catalogue. "AC" and
   * "Non-AC" as sibling amenities lets a room type carry both (meaningless) or
   * neither (indistinguishable from an unfilled form).
   */
  @IsBoolean() airConditioned!: boolean;

  /** Paise. 0 is legal — a type can exist before it is priced. */
  @IsInt() @Min(0) @Max(100_000_000) baseRate!: number;

  @IsOptional() @IsString() @Length(3, 8) currency?: string;

  @IsOptional() @IsInt() @Min(1) @Max(100_000) sizeSqft?: number;

  /** ROOM-scoped amenity ids every room of this type has. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  amenityIds?: string[];
}

export class UpdateRoomTypeDto extends RoomTypeDetailFieldsDto {
  @IsOptional() @IsString() @Length(1, 128) name?: string;

  @IsOptional() @IsString() @Length(0, 2000) description?: string;

  @IsOptional() @IsIn(unitKindValues) unitKind?: (typeof unitKindValues)[number];

  @IsOptional() @IsInt() @Min(1) @Max(20) unitRoomCount?: number;

  @IsOptional() @IsBoolean() privatePool?: boolean;

  @IsOptional() @IsIn(bedTypeValues) bedType?: (typeof bedTypeValues)[number];

  @IsOptional() @IsInt() @Min(1) @Max(20) bedCount?: number;

  @IsOptional() @IsInt() @Min(1) @Max(50) maxOccupancy?: number;

  @IsOptional() @IsInt() @Min(1) @Max(50) maxAdults?: number;

  @IsOptional() @IsInt() @Min(0) @Max(50) maxChildren?: number;

  @IsOptional() @IsBoolean() airConditioned?: boolean;

  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) baseRate?: number;

  @IsOptional() @IsString() @Length(3, 8) currency?: string;

  @IsOptional() @IsInt() @Min(1) @Max(100_000) sizeSqft?: number;

  @IsOptional() @IsIn(roomTypeStatusValues) status?: (typeof roomTypeStatusValues)[number];

  /** Present = replace the whole set. Absent = leave the set untouched. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  amenityIds?: string[];
}

// ---------- Room type photos ----------

/** Multipart field alongside `file`; defaults to ROOM when omitted. */
export class UploadRoomTypePhotoDto {
  @IsOptional()
  @IsIn(roomTypePhotoCategoryValues)
  category?: (typeof roomTypePhotoCategoryValues)[number];
}

/** The complete desired order — `sort_order` becomes the index in this array. */
export class ReorderRoomTypePhotosDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50)
  @IsUUID('4', { each: true })
  ids!: string[];
}

export class RoomTypeFilterDto {
  @IsOptional() @IsIn(roomTypeStatusValues) status?: (typeof roomTypeStatusValues)[number];

  @IsOptional() @IsString() @Length(1, 128) q?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;

  /**
   * Include the per-room private types too. Off by default: the only callers
   * that want them are diagnostics and the room screen resolving its own type.
   */
  @IsOptional() @IsBoolean() @Type(() => Boolean) includePrivate?: boolean;
}

// ---------- Rooms ----------

const ROOM_NUMBER = /^[A-Za-z0-9][A-Za-z0-9\-/ ]{0,31}$/;

export class CreateRoomDto {
  /**
   * The type this room belongs to, when it SHARES one with other rooms.
   *
   * Optional because the app is room-first: most properties here have no two
   * rooms alike, so the usual request sends `specs` instead and the room gets a
   * private type of its own. Exactly one of the two must be present — the
   * service rejects both and neither, since a room cannot be simultaneously
   * grouped and unique.
   */
  @IsOptional() @IsUUID('4') roomTypeId?: string;

  /**
   * This room's OWN specifications — occupancy, beds, size, rate, policies.
   * Sending these creates a room type private to this one room; nothing else
   * can be filed under it.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => RoomTypeInputDto)
  specs?: RoomTypeInputDto;

  @IsString() @Length(1, 32) @Matches(ROOM_NUMBER) number!: string;

  @IsOptional() @IsString() @Length(1, 16) floor?: string;

  @IsOptional() @IsIn(roomStatusValues) status?: (typeof roomStatusValues)[number];

  @IsOptional() @IsString() @Length(0, 2000) notes?: string;

  /** Per-room EXTRAS only — what this room has BEYOND its type. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  amenityIds?: string[];
}

export class UpdateRoomDto {
  @IsOptional() @IsUUID('4') roomTypeId?: string;

  /**
   * Edits to this room's OWN specifications. Only meaningful for a room whose
   * type is private to it; the service refuses these against a SHARED type,
   * because editing 201 must never silently re-specify 202.
   */
  @IsOptional()
  @ValidateNested()
  @Type(() => UpdateRoomTypeDto)
  specs?: UpdateRoomTypeDto;

  @IsOptional() @IsString() @Length(1, 32) @Matches(ROOM_NUMBER) number?: string;

  @IsOptional() @IsString() @Length(1, 16) floor?: string;

  @IsOptional() @IsString() @Length(0, 2000) notes?: string;

  @IsOptional() @IsIn(roomStatusValues) status?: (typeof roomStatusValues)[number];

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  amenityIds?: string[];
}

/**
 * Bulk create. A GM opening a 40-room floor one modal at a time is not a
 * usable product, so this takes either an explicit list of numbers or a
 * numeric range and expands it server-side.
 */
export class BulkCreateRoomsDto {
  @IsUUID('4') roomTypeId!: string;

  @IsOptional() @IsString() @Length(1, 16) floor?: string;

  @IsOptional() @IsIn(roomStatusValues) status?: (typeof roomStatusValues)[number];

  /** Explicit numbers. Mutually sufficient with the range below. */
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(MAX_BULK_ROOMS)
  @IsString({ each: true })
  @Length(1, 32, { each: true })
  // The same shape a single-room create must satisfy — one path must not admit
  // a room number the other rejects.
  @Matches(ROOM_NUMBER, { each: true })
  numbers?: string[];

  /** Range form: `{ prefix: "3", from: 1, to: 20, pad: 2 }` → 301..320. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100_000) from?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(100_000) to?: number;

  @IsOptional() @IsString() @Length(0, 8) prefix?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(6) pad?: number;
}

export class SetRoomStatusDto {
  @IsIn(roomStatusValues) status!: (typeof roomStatusValues)[number];

  @IsOptional() @IsString() @Length(0, 500) note?: string;
}

export class RoomFilterDto {
  @IsOptional() @IsIn(roomStatusValues) status?: (typeof roomStatusValues)[number];

  @IsOptional() @IsUUID('4') roomTypeId?: string;

  @IsOptional() @IsString() @Length(1, 16) floor?: string;

  @IsOptional() @IsString() @Length(1, 32) q?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

// ---------- Owner ----------

export class SetPropertyAmenitiesDto {
  /** The complete desired set — a PUT, so absent ids are removed. */
  @IsArray()
  @ArrayMaxSize(100)
  @IsUUID('4', { each: true })
  amenityIds!: string[];
}
