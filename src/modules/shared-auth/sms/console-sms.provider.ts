import { Injectable, Logger } from '@nestjs/common';
import { SmsProvider } from './sms-provider.interface';

/**
 * Dev/fallback SMS provider. Logs the OTP to the server log only.
 * The OTP is NEVER returned to the client.
 */
@Injectable()
export class ConsoleSmsProvider implements SmsProvider {
  private readonly logger = new Logger('ConsoleSmsProvider');

  async sendOtp(mobile: string, otp: string): Promise<void> {
    this.logger.log(`[SMS] OTP for ${mobile}: ${otp}`);
  }
}
