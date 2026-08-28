import { Injectable, Logger } from '@nestjs/common';

export interface OutboundNotification {
  channel: 'EMAIL' | 'SMS' | 'WHATSAPP' | 'PUSH' | 'IN_APP';
  to: string;
  subject?: string;
  body: string;
  meta?: Record<string, unknown>;
}

export interface ChannelProvider {
  channel: OutboundNotification['channel'];
  send(msg: OutboundNotification): Promise<{ ok: boolean; providerRef?: string }>;
}

export class ConsoleEmailProvider implements ChannelProvider {
  channel = 'EMAIL' as const;
  private logger = new Logger('ConsoleEmailProvider');
  async send(msg: OutboundNotification) {
    this.logger.log(`EMAIL to=${msg.to} subject=${msg.subject ?? '(no subject)'}`);
    return { ok: true, providerRef: `console-${Date.now()}` };
  }
}

@Injectable()
export class NotificationDispatcher {
  private readonly logger = new Logger(NotificationDispatcher.name);
  private providers = new Map<OutboundNotification['channel'], ChannelProvider>();

  constructor() {
    this.register(new ConsoleEmailProvider());
  }

  register(p: ChannelProvider) {
    this.providers.set(p.channel, p);
  }

  async dispatch(msg: OutboundNotification) {
    const provider = this.providers.get(msg.channel);
    if (!provider) {
      this.logger.warn(`No provider registered for channel ${msg.channel}`);
      return { ok: false, reason: 'no_provider' };
    }
    return provider.send(msg);
  }
}
