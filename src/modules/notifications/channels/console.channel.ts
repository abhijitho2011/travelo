import { Logger } from '@nestjs/common';
import type { NotificationChannelName } from '../../../database/schema';
import type { NotificationChannel, RenderedMessage } from './channel.interface';

/**
 * The fallback every configurable channel degrades to.
 *
 * It logs and succeeds. An unconfigured deployment therefore still records a
 * SENT delivery row with the exact copy that would have gone out, which is far
 * more useful for a developer than a queue full of FAILED rows.
 */
export class ConsoleChannel implements NotificationChannel {
  private readonly logger: Logger;

  constructor(readonly channel: NotificationChannelName) {
    this.logger = new Logger(`Console${channel}Channel`);
  }

  async send(to: string, rendered: RenderedMessage): Promise<void> {
    this.logger.log(
      `[${this.channel}] to=${to} subject=${rendered.subject ?? '(none)'} :: ${rendered.body.slice(0, 200)}`,
    );
  }
}

/**
 * WHATSAPP and PUSH. Deliberately NOT faked: there is no provider behind
 * either one, and a channel that silently reported success would put a lie in
 * the delivery audit trail. It logs and no-ops, and the delivery is recorded
 * as SKIPPED by the dispatcher.
 */
export class UnavailableChannel implements NotificationChannel {
  private readonly logger: Logger;
  readonly unavailable = true;

  constructor(readonly channel: NotificationChannelName) {
    this.logger = new Logger(`Unavailable${channel}Channel`);
  }

  async send(to: string, rendered: RenderedMessage): Promise<void> {
    this.logger.warn(
      `${this.channel} is not implemented — dropping notification ${rendered.notificationKey ?? '(unkeyed)'} for ${to}`,
    );
  }
}

export function isUnavailable(channel: NotificationChannel): boolean {
  return (channel as UnavailableChannel).unavailable === true;
}
