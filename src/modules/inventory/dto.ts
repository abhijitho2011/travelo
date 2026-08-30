import { Type, Transform } from 'class-transformer';
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
import { stockMovementTypeValues } from '../../database/schema';

// ---------- Items ----------

export class ItemFilterDto {
  @IsOptional() @IsString() @Length(1, 64) category?: string;
  // `@Type(() => Boolean)` would coerce the string 'false' to true (any
  // non-empty string is truthy). Parse the two literal query strings instead.
  @IsOptional()
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  lowStock?: boolean;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(500) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

export class CreateItemDto {
  @IsString() @Length(1, 200) name!: string;
  @IsString() @Length(1, 64) sku!: string;
  @IsOptional() @IsString() @Length(1, 24) unit?: string;
  @IsOptional() @IsString() @Length(1, 64) category?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10_000_000) reorderLevel?: number;
  /** Optional opening balance; recorded as an initial ADJUST movement. */
  @IsOptional() @IsInt() @Min(0) @Max(10_000_000) openingQty?: number;
  /** Optional cost per unit, integer paise, used to value on-hand stock. */
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000_000) unitCostPaise?: number;
}

export class UpdateItemDto {
  @IsOptional() @IsString() @Length(1, 200) name?: string;
  @IsOptional() @IsString() @Length(1, 64) sku?: string;
  @IsOptional() @IsString() @Length(1, 24) unit?: string;
  @IsOptional() @IsString() @Length(0, 64) category?: string;
  @IsOptional() @IsInt() @Min(0) @Max(10_000_000) reorderLevel?: number;
  @IsOptional() @IsInt() @Min(0) @Max(1_000_000_000) unitCostPaise?: number;
}

// ---------- Stock movements ----------

export class CreateMovementDto {
  @IsIn(stockMovementTypeValues) type!: (typeof stockMovementTypeValues)[number];
  /**
   * Quantity. A positive magnitude for IN/OUT/WASTAGE; a signed value for
   * ADJUST (a stock-take may correct either direction), which must be non-zero.
   */
  @IsInt() @Min(-10_000_000) @Max(10_000_000) qty!: number;
  @IsOptional() @IsString() @Length(1, 500) reason?: string;
}

export class MovementFilterDto {
  @IsOptional() @IsUUID() itemId?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}

// ---------- Suppliers ----------

export class CreateSupplierDto {
  @IsString() @Length(1, 200) name!: string;
  @IsOptional() @IsString() @Length(1, 120) contact?: string;
  @IsOptional() @IsString() @Length(1, 32) phone?: string;
  @IsOptional() @IsString() @Length(1, 200) email?: string;
  @IsOptional() @IsString() @Length(1, 2000) address?: string;
}

export class UpdateSupplierDto {
  @IsOptional() @IsString() @Length(1, 200) name?: string;
  @IsOptional() @IsString() @Length(0, 120) contact?: string;
  @IsOptional() @IsString() @Length(0, 32) phone?: string;
  @IsOptional() @IsString() @Length(0, 200) email?: string;
  @IsOptional() @IsString() @Length(0, 2000) address?: string;
}

// ---------- Purchase orders ----------

export class PoLineDto {
  @IsUUID() itemId!: string;
  @IsInt() @Min(1) @Max(10_000_000) qty!: number;
  /** Paise per unit, integer. */
  @IsInt() @Min(0) @Max(1_000_000_000) unitPricePaise!: number;
}

export class CreatePoDto {
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsString() @Length(1, 200) supplierName?: string;
  @IsOptional() @IsString() @Length(1, 2000) note?: string;
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PoLineDto)
  lines!: PoLineDto[];
}

export class UpdatePoDto {
  @IsOptional() @IsUUID() supplierId?: string;
  @IsOptional() @IsString() @Length(0, 200) supplierName?: string;
  @IsOptional() @IsString() @Length(0, 2000) note?: string;
  @IsOptional()
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => PoLineDto)
  lines?: PoLineDto[];
}

export class PoStatusDto {
  /** Only SENT or CANCELLED are reachable through this endpoint. */
  @IsIn(['SENT', 'CANCELLED']) status!: 'SENT' | 'CANCELLED';
}

export class PoFilterDto {
  @IsOptional() @IsIn(['DRAFT', 'SENT', 'RECEIVED', 'CANCELLED']) status?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) limit?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) offset?: number;
}
