import {
  IsEmail,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Length,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';
import { hotelStaffRoleValues, hotelStaffStatusValues } from '../../database/schema/owner';

const MOBILE_REGEX = /^[0-9]{10,15}$/;

export class RequestOtpDto {
  @IsString() @Matches(MOBILE_REGEX, { message: 'mobile must be 10-15 digits' }) mobile!: string;
}

export class VerifyOtpDto {
  @IsString() @Matches(MOBILE_REGEX, { message: 'mobile must be 10-15 digits' }) mobile!: string;
  @IsString() @Length(4, 8) otp!: string;
}

export class GoogleLoginDto {
  @IsString() @Length(10, 8192) idToken!: string;
}

export class RefreshDto {
  @IsString() @Length(10, 8192) refreshToken!: string;
}

export class AddressDto {
  @IsString() @Length(1, 255) line1!: string;
  @IsString() @Length(1, 128) city!: string;
  @IsOptional() @IsString() district?: string;
  @IsString() @Length(1, 128) state!: string;
  @IsString() @Length(3, 12) pinCode!: string;
  @IsOptional() @IsString() country?: string;
}

export class CreatePropertyDto {
  @IsString() @Length(2, 255) name!: string;
  @IsOptional() @IsInt() @Min(1) @Max(7) starRating?: number;
  @ValidateNested() @Type(() => AddressDto) address!: AddressDto;
  @IsString() @Length(1, 128) city!: string;
  @IsString() @Length(1, 128) state!: string;
}

export class CreateStaffDto {
  @IsIn(hotelStaffRoleValues as unknown as string[]) role!: string;
  @IsString() @Length(1, 128) firstName!: string;
  @IsString() @Length(1, 128) lastName!: string;
  @IsOptional() @IsString() address?: string;
  @IsString() @Length(3, 12) pinCode!: string;
  @IsString() @Length(1, 128) state!: string;
  @IsString() @Length(1, 128) district!: string;
  @IsString() @Matches(MOBILE_REGEX, { message: 'mobile must be 10-15 digits' }) mobile!: string;
  @IsEmail() email!: string;
}

export class SetStaffStatusDto {
  @IsIn(hotelStaffStatusValues as unknown as string[]) status!: string;
}
