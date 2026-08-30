import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, eq, inArray, isNull } from 'drizzle-orm';
import { DRIZZLE, type Database } from '../../database/database.module';
import { deviceTokens } from '../../database/schema';
import type { InAppAudience } from './channels/channel.interface';

export type DeviceApp = 'owner' | 'staff';
export type DevicePlatform = 'android' | 'ios' | 'web';

/**
 * The registry of FCM tokens the PUSH channel sends to.
 *
 * Registration is an idempotent upsert keyed on the token itself: a device that
 * signs in twice, or re-registers after Firebase rotates its token, never
 * creates a duplicate and never stays attached to a previous principal. A token
 * FCM later reports as unregistered is soft-revoked (`revoke`), so the next
 * sign-in from that device simply re-registers it.
 */
@Injectable()
export class DeviceTokensService {
  private readonly logger = new Logger(DeviceTokensService.name);

  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Attach a token to a principal, moving it off any previous owner. */
  async register(
    principal: { audience: Extract<InAppAudience, DeviceApp>; id: string },
    input: { token: string; platform?: DevicePlatform },
  ): Promise<{ ok: true }> {
    const token = input.token.trim();
    if (!token) return { ok: true };
    const platform = input.platform ?? 'android';
    const ownerId = principal.audience === 'owner' ? principal.id : null;
    const staffId = principal.audience === 'staff' ? principal.id : null;

    await this.db
      .insert(deviceTokens)
      .values({
        ownerId,
        staffId,
        token,
        platform,
        app: principal.audience,
        lastSeenAt: new Date(),
        revokedAt: null,
      })
      .onConflictDoUpdate({
        target: deviceTokens.token,
        set: {
          ownerId,
          staffId,
          platform,
          app: principal.audience,
          lastSeenAt: new Date(),
          revokedAt: null,
        },
      });
    return { ok: true };
  }

  /** Detach a token on sign-out. Soft — the row survives for audit. */
  async revoke(token: string): Promise<{ ok: true }> {
    const trimmed = token.trim();
    if (trimmed) {
      await this.db
        .update(deviceTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(deviceTokens.token, trimmed), isNull(deviceTokens.revokedAt)));
    }
    return { ok: true };
  }

  /** Live tokens for a principal — the PUSH channel's fan-out list. */
  async activeTokensFor(audience: InAppAudience, id: string): Promise<string[]> {
    if (audience !== 'owner' && audience !== 'staff') return [];
    const column = audience === 'owner' ? deviceTokens.ownerId : deviceTokens.staffId;
    const rows = await this.db
      .select({ token: deviceTokens.token })
      .from(deviceTokens)
      .where(and(eq(column, id), isNull(deviceTokens.revokedAt)));
    return rows.map((r) => r.token);
  }

  /** Bulk-revoke tokens FCM reported as unregistered, after a send. */
  async revokeMany(tokens: string[]): Promise<void> {
    if (tokens.length === 0) return;
    await this.db
      .update(deviceTokens)
      .set({ revokedAt: new Date() })
      .where(and(inArray(deviceTokens.token, tokens), isNull(deviceTokens.revokedAt)));
    this.logger.log(`Revoked ${tokens.length} unregistered device token(s)`);
  }
}
