import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { integrationConnections, roomTypes } from '../../database/schema';
import { readChannexConfig, writeChannexRoomTypeMapping } from './channex.config';
import { StaffChannelErrors } from './staff-channel-errors';

/**
 * The STAFF view of the channel-manager integration.
 *
 * Connecting a channel manager stays an admin job — credentials, the provider
 * account, the property id on the provider's side. What the hotel's own staff
 * own is the last mile: which of THEIR room types is which room type on the
 * channel. So this surface reads connections and edits nothing but the
 * per-room-type mapping inside `integration_connections.config`.
 *
 * The property is never a client parameter: every read and write resolves
 * against the caller's own `propertyId`, so a foreign id 404s rather than 403s.
 */

export interface ChannelDto {
  id: string;
  provider: string;
  status: string;
  lastSyncAt: Date | null;
  lastSuccessAt: Date | null;
  lastFailureAt: Date | null;
  errorCount: number;
  detail: string | null;
  connected: boolean;
  channexPropertyId: string | null;
}

export interface ChannelMappingDto {
  connectionId: string;
  provider: string;
  status: string;
  connected: boolean;
  mapped: boolean;
  channelRoomTypeId: string | null;
  channelRatePlanId: string | null;
}

/**
 * Statuses the health writer in `ChannexSyncService` actually produces are
 * `HEALTHY`, `WARNING` and `ERROR` (the column defaults to `HEALTHY`).
 * `WARNING` means a run failed once and is being retried — the channel is still
 * wired up — so only `ERROR` (and the disabled state an operator can set by
 * hand) counts as not connected.
 */
const BROKEN_STATUSES = new Set(['ERROR', 'DISABLED', 'DISCONNECTED', 'REVOKED']);

const CHANNEX = 'channex';

@Injectable()
export class StaffChannelsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * A connection counts as connected when its health is not in an error state
   * AND — for Channex, the only provider with a config contract today — the
   * property id on the provider's side has been filled in. Without that id
   * nothing can be pushed or pulled, so a row that lacks it is a half-finished
   * admin setup, not a live channel.
   */
  private static isConnected(row: { provider: string; status: string; config: unknown }): boolean {
    if (BROKEN_STATUSES.has(row.status.toUpperCase())) return false;
    if (row.provider.toLowerCase() === CHANNEX) {
      return Boolean(readChannexConfig(row.config).channexPropertyId);
    }
    return true;
  }

  private static toChannelDto(row: {
    id: string;
    provider: string;
    status: string;
    lastSyncAt: Date | null;
    lastSuccessAt: Date | null;
    lastFailureAt: Date | null;
    errorCount: number;
    detail: string | null;
    config: unknown;
  }): ChannelDto {
    return {
      id: row.id,
      provider: row.provider,
      status: row.status,
      lastSyncAt: row.lastSyncAt ?? null,
      lastSuccessAt: row.lastSuccessAt ?? null,
      lastFailureAt: row.lastFailureAt ?? null,
      errorCount: row.errorCount ?? 0,
      detail: row.detail ?? null,
      connected: StaffChannelsService.isConnected(row),
      channexPropertyId: readChannexConfig(row.config).channexPropertyId ?? null,
    };
  }

  private static toMappingDto(
    row: { id: string; provider: string; status: string; config: unknown },
    roomTypeId: string,
  ): ChannelMappingDto {
    const cfg = readChannexConfig(row.config);
    const channelRoomTypeId = cfg.roomTypeMap[roomTypeId] ?? null;
    return {
      connectionId: row.id,
      provider: row.provider,
      status: row.status,
      connected: StaffChannelsService.isConnected(row),
      mapped: Boolean(channelRoomTypeId),
      channelRoomTypeId,
      channelRatePlanId: cfg.ratePlanMap[roomTypeId] ?? null,
    };
  }

  /** Every connection wired to the caller's property, oldest first. */
  async list(propertyId: string): Promise<{ items: ChannelDto[] }> {
    const rows = await this.connectionsFor(propertyId);
    return { items: rows.map((r) => StaffChannelsService.toChannelDto(r)) };
  }

  /**
   * One row per connection — NOT one row per existing mapping — so the staff app
   * can show "this room type is not on Booking.com yet" instead of showing
   * nothing at all.
   */
  async mappingsForRoomType(
    propertyId: string,
    roomTypeId: string,
  ): Promise<{ items: ChannelMappingDto[] }> {
    await this.requireRoomType(propertyId, roomTypeId);
    const rows = await this.connectionsFor(propertyId);
    return { items: rows.map((r) => StaffChannelsService.toMappingDto(r, roomTypeId)) };
  }

  /**
   * Point one room type at its counterpart on the channel. Read-modify-write of
   * the jsonb through the config helper, so other room types' keys — and any
   * key this file does not know about — survive the write.
   */
  async mapRoomType(
    propertyId: string,
    roomTypeId: string,
    connectionId: string,
    input: { channelRoomTypeId: string; channelRatePlanId?: string },
  ): Promise<ChannelMappingDto> {
    const channelRoomTypeId = (input.channelRoomTypeId ?? '').trim();
    if (!channelRoomTypeId) {
      throw StaffChannelErrors.invalidMapping('A channel room type id is required');
    }
    const channelRatePlanId = input.channelRatePlanId?.trim() || undefined;

    await this.requireRoomType(propertyId, roomTypeId);
    const connection = await this.requireConnection(propertyId, connectionId);

    const config = writeChannexRoomTypeMapping(connection.config, roomTypeId, {
      channelRoomTypeId,
      channelRatePlanId,
    });
    return this.persist(propertyId, connectionId, roomTypeId, config, connection);
  }

  /** Drops only THIS room type's keys from both maps. */
  async unmapRoomType(
    propertyId: string,
    roomTypeId: string,
    connectionId: string,
  ): Promise<ChannelMappingDto> {
    await this.requireRoomType(propertyId, roomTypeId);
    const connection = await this.requireConnection(propertyId, connectionId);

    const config = writeChannexRoomTypeMapping(connection.config, roomTypeId, {});
    return this.persist(propertyId, connectionId, roomTypeId, config, connection);
  }

  // ---------- internals ----------

  private async persist(
    propertyId: string,
    connectionId: string,
    roomTypeId: string,
    config: Record<string, unknown>,
    fallback: { id: string; provider: string; status: string },
  ): Promise<ChannelMappingDto> {
    const [updated] = await this.db
      .update(integrationConnections)
      .set({ config, updatedAt: new Date() })
      .where(
        and(
          eq(integrationConnections.id, connectionId),
          eq(integrationConnections.propertyId, propertyId),
        ),
      )
      .returning();

    return StaffChannelsService.toMappingDto(updated ?? { ...fallback, config }, roomTypeId);
  }

  private async connectionsFor(propertyId: string) {
    return this.db
      .select()
      .from(integrationConnections)
      .where(eq(integrationConnections.propertyId, propertyId))
      .orderBy(asc(integrationConnections.createdAt));
  }

  private async requireConnection(propertyId: string, connectionId: string) {
    const [row] = await this.db
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.id, connectionId),
          eq(integrationConnections.propertyId, propertyId),
        ),
      )
      .limit(1);
    if (!row) throw StaffChannelErrors.connectionNotFound();
    return row;
  }

  private async requireRoomType(propertyId: string, roomTypeId: string) {
    const [row] = await this.db
      .select({ id: roomTypes.id })
      .from(roomTypes)
      .where(
        and(
          eq(roomTypes.id, roomTypeId),
          eq(roomTypes.propertyId, propertyId),
          isNull(roomTypes.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw StaffChannelErrors.roomTypeNotFound();
    return row;
  }
}
