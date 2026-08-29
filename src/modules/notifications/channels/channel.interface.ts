import type { NotificationChannelName } from '../../../database/schema';

export const NOTIFICATION_CHANNELS = Symbol('NOTIFICATION_CHANNELS');

export interface RenderedMessage {
  subject?: string | null;
  body: string;
  relatedType?: string | null;
  relatedId?: string | null;
  notificationKey?: string;
}

/**
 * One outbound transport.
 *
 * `send` either returns (delivered) or throws (retryable). It must never
 * swallow a real failure — the dispatch worker is what decides whether a
 * failure is worth another attempt.
 */
export interface NotificationChannel {
  readonly channel: NotificationChannelName;
  send(to: string, rendered: RenderedMessage): Promise<void>;
}

export type ChannelRegistry = Map<NotificationChannelName, NotificationChannel>;

/**
 * IN_APP recipients are not addresses, they are principals. Encoding the
 * audience in the recipient string keeps ONE `recipient` column honest across
 * every channel instead of three nullable foreign keys on the delivery row.
 */
export type InAppAudience = 'admin' | 'owner' | 'staff';

export function inAppRecipient(audience: InAppAudience, id: string): string {
  return `${audience}:${id}`;
}

export function parseInAppRecipient(
  recipient: string,
): { audience: InAppAudience; id: string } | null {
  const idx = recipient.indexOf(':');
  if (idx <= 0) return null;
  const audience = recipient.slice(0, idx);
  const id = recipient.slice(idx + 1);
  if (!id) return null;
  if (audience !== 'admin' && audience !== 'owner' && audience !== 'staff') return null;
  return { audience, id };
}
