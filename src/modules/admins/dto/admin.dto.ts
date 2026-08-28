import { ApiProperty } from '@nestjs/swagger';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsIn,
  IsOptional,
  IsString,
  MinLength,
} from 'class-validator';

export class CreateAdminDto {
  @ApiProperty()
  @IsEmail()
  email!: string;

  @ApiProperty()
  @IsString()
  @MinLength(2)
  name!: string;

  @ApiProperty({ minLength: 8 })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ isArray: true, description: 'Role keys to grant', required: false })
  @IsArray()
  @IsOptional()
  roleKeys?: string[];
}

export class UpdateAdminDto {
  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  name?: string;

  @ApiProperty({ required: false, isArray: true })
  @IsOptional()
  @IsArray()
  roleKeys?: string[];
}

export class SetStatusDto {
  @ApiProperty({ enum: ['Active', 'Inactive', 'Blocked'] })
  @IsIn(['Active', 'Inactive', 'Blocked'])
  status!: 'Active' | 'Inactive' | 'Blocked';

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AssignRolesDto {
  @ApiProperty({ isArray: true })
  @IsArray()
  @ArrayNotEmpty()
  roleKeys!: string[];
}
