import { ApiProperty } from '@nestjs/swagger';
import { IsString, Length, Matches } from 'class-validator';

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

/** Second-factor exchange: challenge token + a TOTP or a recovery code. */
export class AdminMfaChallengeDto {
  @ApiProperty({ description: 'The mfaToken returned by the first-factor sign-in' })
  @IsString()
  @Length(10, 8192)
  mfaToken!: string;

  @ApiProperty({ example: '123456', description: 'A 6-digit TOTP or a recovery code' })
  @IsString()
  @Length(6, 32)
  code!: string;
}

/** A TOTP (or, for disable, a recovery code) supplied from the Security page. */
export class AdminMfaCodeDto {
  @ApiProperty({ example: '123456' })
  @IsString()
  @Length(6, 32)
  code!: string;
}
