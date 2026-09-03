import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import {
  kotStatusValues,
  menuCategoryStatusValues,
  menuItemStatusValues,
  restaurantOrderStatusValues,
  restaurantPaymentMethodValues,
  restaurantTableStatusValues,
} from '../../database/schema';

// ---------- Tables ----------

export class TableFilterDto {
  @IsOptional()
  @IsIn(restaurantTableStatusValues)
  status?: (typeof restaurantTableStatusValues)[number];
}

export class CreateTableDto {
  @IsString() @Length(1, 64) name!: string;
  @IsInt() @Min(1) @Max(100) seats!: number;
}

export class UpdateTableDto {
  @IsOptional() @IsString() @Length(1, 64) name?: string;
  @IsOptional() @IsInt() @Min(1) @Max(100) seats?: number;
  @IsOptional()
  @IsIn(restaurantTableStatusValues)
  status?: (typeof restaurantTableStatusValues)[number];
}

// ---------- Menu ----------

export class MenuQueryDto {
  /** Managers pass `all=true` to see UNAVAILABLE/ARCHIVED too. */
  @IsOptional() @Type(() => Boolean) @IsBoolean() all?: boolean;
}

export class CreateCategoryDto {
  @IsString() @Length(1, 128) name!: string;
  @IsOptional() @IsInt() @Min(0) @Max(10_000) sortOrder?: number;
}

export class UpdateCategoryDto {
  @IsOptional() @IsString() @Length(1, 128) name?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10_000) sortOrder?: number;
  @IsOptional() @IsIn(menuCategoryStatusValues) status?: (typeof menuCategoryStatusValues)[number];
}

export class CreateMenuItemDto {
  @IsUUID() categoryId!: string;
  @IsString() @Length(1, 160) name!: string;
  @IsOptional() @IsString() @Length(1, 2000) description?: string;
  /** Paise, integer. */
  @IsInt() @Min(0) @Max(100_000_000) pricePaise!: number;
  @IsOptional() @IsBoolean() veg?: boolean;
}

export class UpdateMenuItemDto {
  @IsOptional() @IsUUID() categoryId?: string;
  @IsOptional() @IsString() @Length(1, 160) name?: string;
  @IsOptional() @IsString() @Length(0, 2000) description?: string;
  @IsOptional() @IsInt() @Min(0) @Max(100_000_000) pricePaise?: number;
  @IsOptional() @IsBoolean() veg?: boolean;
  @IsOptional() @IsIn(menuItemStatusValues) status?: (typeof menuItemStatusValues)[number];
}

/** The 86 flow — mark an item available or not without touching anything else. */
export class SetAvailabilityDto {
  @IsBoolean() available!: boolean;
}

// ---------- Orders ----------

export class OrderFilterDto {
  @IsOptional()
  @IsIn(restaurantOrderStatusValues)
  status?: (typeof restaurantOrderStatusValues)[number];
  @IsOptional() @IsUUID() tableId?: string;
  /** Only my own orders (the waiter's board). */
  @IsOptional() @Type(() => Boolean) @IsBoolean() mine?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

export class CreateOrderDto {
  /** Omit for a takeaway/counter order. */
  @IsOptional() @IsUUID() tableId?: string;
  @IsInt() @Min(1) @Max(100) guestCount!: number;
}

export class AddOrderItemDto {
  @IsUUID() menuItemId!: string;
  @IsInt() @Min(1) @Max(100) qty!: number;
  @IsOptional() @IsString() @Length(1, 500) notes?: string;
}

export class AddOrderItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(50)
  @ValidateNested({ each: true })
  @Type(() => AddOrderItemDto)
  items!: AddOrderItemDto[];
}

export class KotUpdateDto {
  @IsIn(kotStatusValues) status!: (typeof kotStatusValues)[number];
}

export class SettleOrderDto {
  @IsIn(restaurantPaymentMethodValues) method!: (typeof restaurantPaymentMethodValues)[number];
  /** Required when method is ROOM_CHARGE — the in-house reservation to bill. */
  @IsOptional() @IsUUID() reservationId?: string;
  /** Required when method is CORPORATE — the account to bill. */
  @IsOptional() @IsUUID() corporateAccountId?: string;
  /** Partial settlement: pay this much now. Omitted = the whole balance. */
  @IsOptional() @IsInt() @Min(1) @Max(100_000_000) amountPaise?: number;
  @IsOptional() @IsString() @Length(0, 120) reference?: string;
  @IsOptional() @IsString() @Length(0, 500) remarks?: string;
}

export class OrderDiscountDto {
  /** Paise off the bill, before service charge and tax. */
  @IsInt() @Min(0) @Max(100_000_000) amountPaise!: number;
  @IsString() @Length(2, 200) reason!: string;
}

export class BulkMenuItemsDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(500)
  @ValidateNested({ each: true })
  @Type(() => CreateMenuItemDto)
  items!: CreateMenuItemDto[];
}

export class CancelOrderDto {
  @IsString() @Length(2, 500) reason!: string;
}
