import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsUUID,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class GridQueryDto {
  @Matches(ISO_DATE) from!: string;
  /** Exclusive. */
  @Matches(ISO_DATE) to!: string;
  @IsOptional() @IsUUID() ratePlanId?: string;
}

export class DateRangeDto {
  @Matches(ISO_DATE) from!: string;
  /** Inclusive — "the 10th to the 12th" means three days. */
  @Matches(ISO_DATE) to!: string;
}

export class ChannelOverrideDto {
  @IsUUID() connectionId!: string;
  /** Relative to the resolved price, in basis points; omit to leave price alone. */
  @IsOptional() @IsInt() @Min(-9_000) @Max(50_000) priceDeltaBp?: number;
  /** Rooms offered to THIS channel; omit to leave availability alone. */
  @IsOptional() @IsInt() @Min(0) @Max(10_000) available?: number;
  /** true removes the channel's override for these days. */
  @IsOptional() @IsBoolean() clear?: boolean;
}

export class BulkSetDto {
  /** Absolute price in paise; null clears the day so it falls back. */
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) pricePaise?: number | null;
  /** Relative change on the resolved price, basis points (+1000 = +10%). */
  @IsOptional() @IsInt() @Min(-9_000) @Max(50_000) priceDeltaBp?: number;
  /** Cap on rooms to sell; null = all of them. */
  @IsOptional() @IsInt() @Min(0) @Max(10_000) available?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(365) minLos?: number | null;
  @IsOptional() @IsInt() @Min(1) @Max(365) maxLos?: number | null;
  @IsOptional() @IsBoolean() stopSell?: boolean;
  @IsOptional() @IsBoolean() closedToArrival?: boolean;
  @IsOptional() @IsBoolean() closedToDeparture?: boolean;
  @IsOptional() @ValidateNested() @Type(() => ChannelOverrideDto) channel?: ChannelOverrideDto;
}

export class BulkUpdateDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @IsUUID('4', { each: true })
  roomTypeIds!: string[];
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(24)
  @ValidateNested({ each: true })
  @Type(() => DateRangeDto)
  ranges!: DateRangeDto[];
  /** 0 = Sunday … 6 = Saturday. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(7)
  @IsIn([0, 1, 2, 3, 4, 5, 6], { each: true })
  daysOfWeek?: number[];
  @IsOptional() @IsUUID() ratePlanId?: string;
  @ValidateNested() @Type(() => BulkSetDto) set!: BulkSetDto;
}

export class ChangesQueryDto {
  @IsOptional() @IsUUID() roomTypeId?: string;
  @IsOptional() @Matches(ISO_DATE) from?: string;
  @IsOptional() @Matches(ISO_DATE) to?: string;
  @IsOptional() @IsUUID() batchId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}
