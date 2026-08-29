import { Logger } from '@nestjs/common';
import {
  SmsProvider,
  SmsTextNotConfiguredError,
} from '../../shared-auth/sms/sms-provider.interface';
import type { NotificationChannel, RenderedMessage } from './channel.interface';

/**
 * SMS delivery. There is exactly ONE SMS stack in this codebase — the
 * shared-auth `SmsProvider` (BSNL DLT in production, console otherwise) — and
 * this channel is a thin adapter onto it, not a second client.
 */
export class SmsNotificationChannel implements NotificationChannel {
  readonly channel = 'SMS' as const;
  private readonly logger = new Logger('SmsNotificationChannel');

  constructor(private readonly provider: SmsProvider) {}

  async send(to: string, rendered: RenderedMessage): Promise<void> {
    try {
      await this.provider.sendText(to, rendered.body);
    } catch (err) {
      if (err instanceof SmsTextNotConfiguredError) {
        // Not a delivery failure — there is no registered template to send
        // under. Retrying would never succeed, so surface it as skippable.
        this.logger.warn(
          `SMS not configured for notifications (${rendered.notificationKey ?? 'unkeyed'}): ${err.message}`,
        );
        throw err;
      }
      throw err;
    }
  }
}
