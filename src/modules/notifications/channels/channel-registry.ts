import { Logger } from '@nestjs/common';
import type { AppEnv } from '../../../config/env';
import type { Database } from '../../../database/database.module';
import type { SmsProvider } from '../../shared-auth/sms/sms-provider.interface';
import type { ChannelRegistry } from './channel.interface';
import { ConsoleChannel, UnavailableChannel } from './console.channel';
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
  deps: { db: Database; sms: SmsProvider },
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

  // Explicitly unimplemented. See UnavailableChannel — no fake success.
  registry.set('WHATSAPP', new UnavailableChannel('WHATSAPP'));
  registry.set('PUSH', new UnavailableChannel('PUSH'));

  return registry;
}
