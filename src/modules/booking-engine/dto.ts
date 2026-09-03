import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

export class PublicAvailabilityQueryDto {
  @Matches(ISO_DATE) checkIn!: string;
  @Matches(ISO_DATE) checkOut!: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(20) adults?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(0) @Max(20) children?: number;
}

export class PublicAddonDto {
  @IsUUID() id!: string;
  @IsOptional() @IsInt() @Min(1) @Max(50) quantity?: number;
}

/**
 * A guest booking from the hosted page or the widget. Payment is at the
 * property, so the booking is a HOLD (PENDING with the property's expiry) and
 * the desk confirms it — unless the property has no hold expiry configured,
 * in which case it lands CONFIRMED and the desk treats it like a phone booking.
 */
export class PublicReservationDto {
  @IsUUID() roomTypeId!: string;
  @IsOptional() @IsUUID() ratePlanId?: string;
  @Matches(ISO_DATE) checkIn!: string;
  @Matches(ISO_DATE) checkOut!: string;
  @IsInt() @Min(1) @Max(20) adults!: number;
  @IsOptional() @IsInt() @Min(0) @Max(20) children?: number;
  @IsString() @Length(2, 160) guestName!: string;
  @IsString() @Matches(/^\+?[0-9]{8,15}$/) guestPhone!: string;
  @IsOptional() @IsEmail() guestEmail?: string;
  @IsOptional() @IsString() @Length(0, 1000) notes?: string;
  @IsOptional() @IsString() @Length(0, 40) couponCode?: string;
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(20)
  @ValidateNested({ each: true })
  @Type(() => PublicAddonDto)
  addons?: PublicAddonDto[];
}
