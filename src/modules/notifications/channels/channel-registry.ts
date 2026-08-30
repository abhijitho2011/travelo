import { Logger } from '@nestjs/common';
import type { AppEnv } from '../../../config/env';
import type { Database } from '../../../database/database.module';
import type { FirebaseService } from '../../shared-auth/firebase.service';
import type { SmsProvider } from '../../shared-auth/sms/sms-provider.interface';
import type { DeviceTokensService } from '../device-tokens.service';
import type { ChannelRegistry } from './channel.interface';
import { ConsoleChannel, UnavailableChannel } from './console.channel';
import { FcmPushChannel } from './fcm-push.channel';
import { InAppNotificationChannel } from './in-app.channel';
import { SmsNotificationChannel } from './sms.channel';
import { SmtpEmailChannel, smtpSettingsFrom } from './smtp-email.channel';

/**
 * Chooses one implementation per channel from the environment.
 *
 * The rule for every configurable channel is the same: configured ⇒ real
 * provider, unconfigured ⇒ console provider plus ONE boot warning. Missing
 * configuration is never a crash — a deployment without SMTP still runs, still
 * records deliveries, and still shows the copy in the log.
 */
export function buildChannelRegistry(
  env: Partial<AppEnv>,
  deps: {
    db: Database;
    sms: SmsProvider;
    deviceTokens?: DeviceTokensService;
    firebase?: FirebaseService;
  },
  logger: Logger = new Logger('NotificationChannels'),
): ChannelRegistry {
  const registry: ChannelRegistry = new Map();

  const smtp = smtpSettingsFrom(env);
  if (smtp) {
    logger.log(`EMAIL channel: SMTP ${smtp.host}:${smtp.port} as ${smtp.from}`);
    registry.set('EMAIL', new SmtpEmailChannel(smtp));
  } else {
    logger.warn(
      'EMAIL channel: SMTP_HOST/MAIL_FROM not configured — notification emails will be logged, not sent.',
    );
    registry.set('EMAIL', new ConsoleChannel('EMAIL'));
  }

  registry.set('SMS', new SmsNotificationChannel(deps.sms));
  registry.set('IN_APP', new InAppNotificationChannel(deps.db));

  // PUSH is real when a device-token registry and Firebase are wired in. The
  // channel itself self-skips (never fails) when Firebase is unconfigured or a
  // principal has no registered devices, so this is safe on every deployment.
  if (deps.deviceTokens && deps.firebase) {
    logger.log('PUSH channel: Firebase Cloud Messaging');
    registry.set('PUSH', new FcmPushChannel(deps.deviceTokens, deps.firebase));
  } else {
    registry.set('PUSH', new UnavailableChannel('PUSH'));
  }

  // Explicitly unimplemented. See UnavailableChannel — no fake success.
  registry.set('WHATSAPP', new UnavailableChannel('WHATSAPP'));

  return registry;
}
