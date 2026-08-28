export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

export interface SmsProvider {
  sendOtp(mobile: string, otp: string): Promise<void>;
}
