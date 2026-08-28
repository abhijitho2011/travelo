import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, Length, Matches, MinLength } from 'class-validator';

export class LoginDto {
  @ApiProperty({ example: 'admin@tavelo.local' })
  @IsEmail()
  email!: string;

  @ApiProperty({ example: 'ChangeMe!12345' })
  @IsString()
  @MinLength(8)
  password!: string;

  @ApiProperty({ required: false })
  @IsOptional()
  @IsString()
  mfaCode?: string;
}

export class RefreshDto {
  @ApiProperty()
  @IsString()
  refreshToken!: string;
}

/** Accepts 9895077492, +91 98950 77492, 09895077492 … — normalised server-side. */
const MOBILE_REGEX = /^[+0-9][0-9 ()-]{8,19}$/;

export class AdminRequestOtpDto {
  @ApiProperty({ example: '9895077492' })
  @IsString()
  @Matches(MOBILE_REGEX, { message: 'mobile must be a valid phone number' })
  mobile!: string;
}

export class AdminVerifyOtpDto {
  @ApiProperty({ example: '9895077492' })
  @IsString()
  @Matches(MOBILE_REGEX, { message: 'mobile must be a valid phone number' })
  mobile!: string;

  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(4, 8)
  otp!: string;
}

export class AdminGoogleLoginDto {
  @ApiProperty({ description: 'Firebase ID token from the browser sign-in flow' })
  @IsString()
  @Length(10, 8192)
  idToken!: string;
}
