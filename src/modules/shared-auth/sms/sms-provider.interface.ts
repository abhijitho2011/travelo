export const SMS_PROVIDER = Symbol('SMS_PROVIDER');

/** Thrown when a provider has no DLT template registered for free-text sends. */
export class SmsTextNotConfiguredError extends Error {
  constructor(message = 'SMS text sending is not configured for this provider') {
    super(message);
    this.name = 'SmsTextNotConfiguredError';
  }
}

export interface SmsProvider {
  sendOtp(mobile: string, otp: string): Promise<void>;
  /**
   * Non-OTP transactional SMS (notifications). Separate from `sendOtp` because
   * Indian DLT binds every message to a registered content template — the OTP
   * template cannot legally carry a notification body.
   *
   * Throws `SmsTextNotConfiguredError` when no notification template is
   * registered, which the notification channel treats as "skip", not "fail".
   */
  sendText(mobile: string, body: string): Promise<void>;
}
