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
} from 'class-validator';
import {
  amenityScopeValues,
  amenityStatusValues,
  bedTypeValues,
  roomStatusValues,
  roomTypeStatusValues,
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

export class RoomTypeInputDto {
  @IsString() @Length(1, 128) name!: string;

  @IsOptional() @IsString() @Length(0, 2000) description?: string;

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

export class UpdateRoomTypeDto {
  @IsOptional() @IsString() @Length(1, 128) name?: string;

  @IsOptional() @IsString() @Length(0, 2000) description?: string;

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

export class RoomTypeFilterDto {
  @IsOptional() @IsIn(roomTypeStatusValues) status?: (typeof roomTypeStatusValues)[number];

  @IsOptional() @IsString() @Length(1, 128) q?: string;

  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) limit?: number;

  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

// ---------- Rooms ----------

const ROOM_NUMBER = /^[A-Za-z0-9][A-Za-z0-9\-/ ]{0,31}$/;

export class CreateRoomDto {
  @IsUUID('4') roomTypeId!: string;

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
