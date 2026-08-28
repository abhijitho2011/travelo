import { IsEmail, IsIn, IsInt, IsObject, IsOptional, IsString, Length, Min } from 'class-validator';
import { ownerStatusValues } from '../../database/schema/phase2';

export class CreateOwnerDto {
  @IsString() @Length(2, 255) name!: string;
  @IsEmail() email!: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() gstNumber?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsObject() address?: Record<string, unknown>;
}

export class UpdateOwnerDto {
  @IsOptional() @IsString() name?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() company?: string;
  @IsOptional() @IsString() gstNumber?: string;
  @IsOptional() @IsString() city?: string;
  @IsOptional() @IsString() country?: string;
  @IsOptional() @IsObject() address?: Record<string, unknown>;
}

export class SetOwnerStatusDto {
  @IsOptional() @IsString() reason?: string;
}

export class OwnerFilterDto {
  @IsOptional() @IsInt() @Min(0) offset?: number;
  @IsOptional() @IsInt() @Min(1) limit?: number;
  @IsOptional() @IsString() q?: string;
  @IsOptional() @IsIn(ownerStatusValues as unknown as string[]) status?: string;
}
