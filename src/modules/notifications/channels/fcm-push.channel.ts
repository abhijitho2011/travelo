import { Logger } from '@nestjs/common';
import type { FirebaseService } from '../../shared-auth/firebase.service';
import type { DeviceTokensService } from '../device-tokens.service';
import {
  parseInAppRecipient,
  type NotificationChannel,
  type RenderedMessage,
} from './channel.interface';

/**
 * A permanent, non-retryable "nothing to send" for PUSH. Mirrors
 * SmsTextNotConfiguredError: the delivery pipeline marks these SKIPPED rather
 * than burning five retry attempts. Raised when push is unconfigured, the
 * recipient is malformed, or the principal has no registered devices.
 */
export class PushDeliverySkipped extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'PushDeliverySkipped';
  }
}

/**
 * PUSH via Firebase Cloud Messaging.
 *
 * Resolves the IN_APP-style recipient (`owner:<id>` / `staff:<id>`) to its live
 * device tokens and fans the message out. Tokens FCM reports as unregistered
 * are revoked in the same pass, so the token table self-heals. When FCM accepts
 * none of the tokens it throws (retryable); when there is simply nothing to
 * send it raises PushDeliverySkipped (permanent, SKIPPED).
 */
export class FcmPushChannel implements NotificationChannel {
  readonly channel = 'PUSH' as const;
  private readonly logger = new Logger('FcmPushChannel');

  constructor(
    private readonly deviceTokens: DeviceTokensService,
    private readonly firebase: FirebaseService,
  ) {}

  async send(to: string, rendered: RenderedMessage): Promise<void> {
    const target = parseInAppRecipient(to);
    if (!target || (target.audience !== 'owner' && target.audience !== 'staff')) {
      throw new PushDeliverySkipped(`PUSH recipient "${to}" is not a device principal`);
    }
    if (!(await this.firebase.messagingAvailable())) {
      throw new PushDeliverySkipped('push messaging is not configured');
    }

    const tokens = await this.deviceTokens.activeTokensFor(target.audience, target.id);
    if (tokens.length === 0) {
      throw new PushDeliverySkipped(`no registered devices for ${to}`);
    }

    const data: Record<string, string> = { notificationKey: rendered.notificationKey ?? '' };
    if (rendered.relatedType) data.relatedType = rendered.relatedType;
    if (rendered.relatedId) data.relatedId = rendered.relatedId;

    const result = await this.firebase.sendPush(tokens, {
      title: rendered.subject ?? 'Tavelo',
      body: rendered.body,
      data,
    });

    if (result.invalidTokens.length > 0) {
      await this.deviceTokens.revokeMany(result.invalidTokens);
    }

    // Every token failed for a non-invalid reason (network, quota) — retryable.
    if (result.successCount === 0 && tokens.length > result.invalidTokens.length) {
      throw new Error(`FCM delivered to 0 of ${tokens.length} device(s)`);
    }
    this.logger.log(
      `PUSH ${rendered.notificationKey ?? ''} → ${to}: ${result.successCount}/${tokens.length} delivered`,
    );
  }
}
