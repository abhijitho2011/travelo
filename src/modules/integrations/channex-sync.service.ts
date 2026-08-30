import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, gt, inArray, isNull, lt, ne } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  OCCUPYING_STATUSES,
  integrationConnections,
  reservations as reservationsTable,
  rooms,
  roomTypes,
  type RoomStatus,
} from '../../database/schema';
import { ReservationsService } from '../reservations/reservations.service';
import { addDays, coversDate, today, type IsoDate } from '../reservations/reservation-rules';
import {
  ChannexClient,
  type ChannexAvailabilityUpdate,
  type ChannexBooking,
  type ChannexRateUpdate,
} from './channex.client';
import {
  readChannexConfig,
  invertRoomTypeMap,
  type ChannexConnectionConfig,
} from './channex.config';
import { ChannexApiError, ChannexErrors } from './channex.errors';
import {
  channexSyncLog,
  channexWebhookEvents,
  reservationExternalRefs,
  type ChannexDirection,
  type ChannexEntity,
} from './channex.schema';

/** How far forward a run publishes availability and rates. */
export const DEFAULT_HORIZON_DAYS = 90;

export const CHANNEX_PROVIDER = 'CHANNEX';

/** A room type's free-room count for one night. */
export interface NightlyAvailability {
  roomTypeId: string;
  date: IsoDate;
  available: number;
}

export interface AvailabilityInput {
  rooms: { roomTypeId: string }[];
  reservations: { roomTypeId: string; checkIn: IsoDate; checkOut: IsoDate }[];
  /** Inclusive. */
  start: IsoDate;
  /** EXCLUSIVE, matching `check_out` and every other window in this codebase. */
  end: IsoDate;
}

export interface SyncOutcome {
  connectionId: string;
  availability: { pushed: number; ok: boolean };
  rates: { pushed: number; ok: boolean };
  bookings: { created: number; skipped: number; duplicates: number; ok: boolean };
  ok: boolean;
}

/**
 * The Channex conversation: we push what is free and what it costs, Channex
 * pushes back what got sold.
 *
 * Two rules run through all of it:
 *
 *  1. A RUN NEVER CRASHES. Every leg is wrapped, writes a `channex_sync_log`
 *     row either way, and one failing leg (or one unmapped room type, or one
 *     malformed booking) does not abort the rest. A channel manager that stops
 *     syncing silently is worse than one that syncs partially and says so.
 *
 *  2. NOTHING IS REIMPLEMENTED. Availability uses the reservations module's own
 *     `coversDate`/`OCCUPYING_STATUSES`, and inbound bookings are created
 *     through `ReservationsService.create`, so OTA bookings obey the exact
 *     same overlap, capacity and transition rules as a walk-in.
 */
@Injectable()
export class ChannexSyncService {
  private readonly log = new Logger(ChannexSyncService.name);

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly client: ChannexClient,
    private readonly reservations: ReservationsService,
  ) {}

  get configured(): boolean {
    return this.client.configured;
  }

  // ---------- Availability maths (pure) ----------

  /**
   * Per room type, per night: rooms of that type MINUS the committed
   * reservations of that type in house that night.
   *
   * A reservation covers a night when `checkIn <= night < checkOut` —
   * `coversDate` from the reservations module, imported rather than rewritten.
   * That exclusivity is what makes same-day turnover come out right: a stay
   * ending on the 15th and one starting on the 15th consume ONE room-night
   * each on different nights, so the 15th is not double-counted.
   *
   * Clamped at zero. An oversell already on the books must not be published as
   * negative availability, which some channels read as "unlimited".
   */
  static computeAvailability(input: AvailabilityInput): NightlyAvailability[] {
    const roomsByType = new Map<string, number>();
    for (const r of input.rooms) {
      roomsByType.set(r.roomTypeId, (roomsByType.get(r.roomTypeId) ?? 0) + 1);
    }

    const out: NightlyAvailability[] = [];
    for (const [roomTypeId, total] of roomsByType) {
      const stays = input.reservations.filter((r) => r.roomTypeId === roomTypeId);
      for (let date = input.start; date < input.end; date = addDays(date, 1)) {
        const occupied = stays.filter((s) => coversDate(s, date)).length;
        out.push({ roomTypeId, date, available: Math.max(0, total - occupied) });
      }
    }
    return out;
  }

  /**
   * Collapses consecutive nights with the same count into one Channex range.
   *
   * `date_to` is INCLUSIVE on the Channex side while every Tavelo window is
   * exclusive, so the conversion happens here, once, and nowhere else.
   */
  static toAvailabilityRanges(
    channexPropertyId: string,
    nights: NightlyAvailability[],
    roomTypeMap: Record<string, string>,
  ): { updates: ChannexAvailabilityUpdate[]; unmapped: string[] } {
    const updates: ChannexAvailabilityUpdate[] = [];
    const unmapped = new Set<string>();
    const byType = new Map<string, NightlyAvailability[]>();
    for (const n of nights) {
      const list = byType.get(n.roomTypeId) ?? [];
      list.push(n);
      byType.set(n.roomTypeId, list);
    }

    for (const [taveloId, list] of byType) {
      const channexRoomTypeId = roomTypeMap[taveloId];
      if (!channexRoomTypeId) {
        unmapped.add(taveloId);
        continue;
      }
      const sorted = [...list].sort((a, b) => (a.date < b.date ? -1 : 1));
      let runStart = sorted[0];
      let runEnd = sorted[0];
      const flush = () => {
        updates.push({
          property_id: channexPropertyId,
          room_type_id: channexRoomTypeId,
          date_from: runStart.date,
          date_to: runEnd.date,
          availability: runStart.available,
        });
      };
      for (const night of sorted.slice(1)) {
        const contiguous = night.date === addDays(runEnd.date, 1);
        if (contiguous && night.available === runStart.available) {
          runEnd = night;
          continue;
        }
        flush();
        runStart = night;
        runEnd = night;
      }
      flush();
    }
    return { updates, unmapped: [...unmapped] };
  }

  // ---------- Connection plumbing ----------

  async requireChannexConnection(id: string) {
    const [row] = await this.db
      .select()
      .from(integrationConnections)
      .where(eq(integrationConnections.id, id))
      .limit(1);
    if (!row) throw ChannexErrors.notFound();
    if (row.provider !== CHANNEX_PROVIDER) throw ChannexErrors.wrongProvider(row.provider);
    return row;
  }

  private async writeLog(
    connectionId: string,
    direction: ChannexDirection,
    entity: ChannexEntity,
    status: 'SUCCESS' | 'FAILED',
    parts: { request?: string; response?: string; error?: string },
  ): Promise<void> {
    await this.db.insert(channexSyncLog).values({
      connectionId,
      direction,
      entity,
      status,
      requestSummary: parts.request?.slice(0, 2000) ?? null,
      responseSummary: parts.response?.slice(0, 2000) ?? null,
      error: parts.error?.slice(0, 2000) ?? null,
    });
  }

  /** Never leaks a key: `ChannexApiError` carries the RESPONSE body only. */
  private static reason(err: unknown): string {
    if (err instanceof ChannexApiError) return err.summary;
    return (err as Error)?.message?.slice(0, 500) ?? 'unknown error';
  }

  async listLogs(connectionId: string, params: { limit?: number; offset?: number } = {}) {
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;
    const rows = await this.db
      .select()
      .from(channexSyncLog)
      .where(eq(channexSyncLog.connectionId, connectionId))
      .orderBy(desc(channexSyncLog.createdAt))
      .limit(limit)
      .offset(offset);
    return { items: rows, limit, offset };
  }

  /**
   * Health after a run.
   *
   * Success RESETS `error_count` and clears the connection back to HEALTHY —
   * a channel that recovers must stop paging someone. Failure counts up and
   * only reaches ERROR on the second consecutive one, because a single timed
   * out request against a channel manager is weather, not a fault.
   */
  private async updateHealth(
    connectionId: string,
    ok: boolean,
    priorErrors: number,
    detail: string,
  ): Promise<void> {
    const now = new Date();
    if (ok) {
      await this.db
        .update(integrationConnections)
        .set({
          status: 'HEALTHY',
          errorCount: 0,
          lastSyncAt: now,
          lastSuccessAt: now,
          detail: detail.slice(0, 2000),
          updatedAt: now,
        })
        .where(eq(integrationConnections.id, connectionId));
      return;
    }
    const errorCount = priorErrors + 1;
    await this.db
      .update(integrationConnections)
      .set({
        status: errorCount >= 2 ? 'ERROR' : 'WARNING',
        errorCount,
        lastSyncAt: now,
        lastFailureAt: now,
        detail: detail.slice(0, 2000),
        updatedAt: now,
      })
      .where(eq(integrationConnections.id, connectionId));
  }

  // ---------- The run ----------

  /**
   * One full exchange for one connection. Refuses up front — before any
   * writes — when the adapter has no credentials or the connection has never
   * been mapped to a Channex property.
   */
  async syncConnection(
    connectionId: string,
    opts: { horizonDays?: number; now?: Date } = {},
  ): Promise<SyncOutcome> {
    if (!this.configured) throw ChannexErrors.notConfigured();
    const connection = await this.requireChannexConnection(connectionId);
    const cfg = readChannexConfig(connection.config);
    if (!cfg.channexPropertyId) throw ChannexErrors.unmappedProperty();
    if (!connection.propertyId) throw ChannexErrors.unmappedProperty();

    const now = opts.now ?? new Date();
    const start = today(now);
    const end = addDays(start, opts.horizonDays ?? DEFAULT_HORIZON_DAYS);

    const availability = await this.pushAvailability(connection.id, connection.propertyId, cfg, {
      start,
      end,
    });
    const rates = await this.pushRates(connection.id, connection.propertyId, cfg, { start, end });
    const bookings = await this.pullBookings(
      connection.id,
      connection.propertyId,
      cfg,
      connection.lastSyncAt ?? undefined,
    );

    const ok = availability.ok && rates.ok && bookings.ok;
    await this.updateHealth(
      connection.id,
      ok,
      connection.errorCount ?? 0,
      ok
        ? `availability ${availability.pushed}, rates ${rates.pushed}, bookings +${bookings.created}`
        : 'one or more Channex sync legs failed — see channex_sync_log',
    );
    return { connectionId: connection.id, availability, rates, bookings, ok };
  }

  /** Availability for [start, end): rooms of a type minus who is in them. */
  async pushAvailability(
    connectionId: string,
    propertyId: string,
    cfg: ChannexConnectionConfig,
    window: { start: IsoDate; end: IsoDate },
  ): Promise<{ pushed: number; ok: boolean }> {
    try {
      const roomRows = await this.db
        .select({ roomTypeId: rooms.roomTypeId })
        .from(rooms)
        .where(
          and(
            eq(rooms.propertyId, propertyId),
            isNull(rooms.deletedAt),
            // An out-of-order room is not sellable, so it is not inventory.
            ne(rooms.status, 'OUT_OF_ORDER' as RoomStatus),
          ),
        );

      // Same strict-inequality window the booking engine uses: a stay touching
      // the horizon at either edge is in play, one merely abutting it is not.
      const stays = await this.db
        .select({
          roomTypeId: reservationsTable.roomTypeId,
          checkIn: reservationsTable.checkIn,
          checkOut: reservationsTable.checkOut,
        })
        .from(reservationsTable)
        .where(
          and(
            eq(reservationsTable.propertyId, propertyId),
            isNull(reservationsTable.deletedAt),
            inArray(reservationsTable.status, [...OCCUPYING_STATUSES]),
            lt(reservationsTable.checkIn, window.end),
            gt(reservationsTable.checkOut, window.start),
          ),
        );

      const nights = ChannexSyncService.computeAvailability({
        rooms: roomRows,
        reservations: stays,
        start: window.start,
        end: window.end,
      });
      const { updates, unmapped } = ChannexSyncService.toAvailabilityRanges(
        cfg.channexPropertyId as string,
        nights,
        cfg.roomTypeMap,
      );

      const res = await this.client.pushAvailability(cfg.channexPropertyId as string, updates);
      await this.writeLog(connectionId, 'PUSH', 'AVAILABILITY', 'SUCCESS', {
        request: `${updates.length} range(s), ${window.start}..${window.end}${
          unmapped.length ? `, skipped unmapped room types: ${unmapped.join(', ')}` : ''
        }`,
        response: `accepted ${res.accepted}`,
      });
      return { pushed: res.accepted, ok: true };
    } catch (err) {
      await this.writeLog(connectionId, 'PUSH', 'AVAILABILITY', 'FAILED', {
        request: `${window.start}..${window.end}`,
        error: ChannexSyncService.reason(err),
      });
      return { pushed: 0, ok: false };
    }
  }

  /** room_type.base_rate (paise) -> the mapped Channex rate plan, in rupees. */
  async pushRates(
    connectionId: string,
    propertyId: string,
    cfg: ChannexConnectionConfig,
    window: { start: IsoDate; end: IsoDate },
  ): Promise<{ pushed: number; ok: boolean }> {
    try {
      const types = await this.db
        .select({ id: roomTypes.id, baseRate: roomTypes.baseRate })
        .from(roomTypes)
        .where(
          and(
            eq(roomTypes.propertyId, propertyId),
            isNull(roomTypes.deletedAt),
            eq(roomTypes.status, 'ACTIVE'),
          ),
        );

      const unmapped: string[] = [];
      const updates: ChannexRateUpdate[] = [];
      for (const t of types) {
        const ratePlanId = cfg.ratePlanMap[t.id];
        if (!ratePlanId) {
          unmapped.push(t.id);
          continue;
        }
        updates.push({
          property_id: cfg.channexPropertyId as string,
          rate_plan_id: ratePlanId,
          date_from: window.start,
          // Channex's date_to is inclusive; our `end` is exclusive.
          date_to: addDays(window.end, -1),
          rate: (t.baseRate / 100).toFixed(2),
        });
      }

      const res = await this.client.pushRates(cfg.channexPropertyId as string, updates);
      await this.writeLog(connectionId, 'PUSH', 'RATES', 'SUCCESS', {
        request: `${updates.length} rate plan(s)${
          unmapped.length ? `, skipped unmapped room types: ${unmapped.join(', ')}` : ''
        }`,
        response: `accepted ${res.accepted}`,
      });
      return { pushed: res.accepted, ok: true };
    } catch (err) {
      await this.writeLog(connectionId, 'PUSH', 'RATES', 'FAILED', {
        error: ChannexSyncService.reason(err),
      });
      return { pushed: 0, ok: false };
    }
  }

  // ---------- Inbound bookings ----------

  /**
   * Pull everything inserted since the last run and land it as Tavelo
   * reservations.
   *
   * ONE BAD BOOKING NEVER STOPS THE BATCH. An unmapped room type, a missing
   * date, a booking the engine itself refuses (no availability) — each writes
   * a FAILED log line naming the booking and the reason, and the loop moves
   * on. A channel manager delivering one odd payload must not cost a hotel the
   * other twenty bookings in the same run.
   */
  async pullBookings(
    connectionId: string,
    propertyId: string,
    cfg: ChannexConnectionConfig,
    since?: Date,
  ): Promise<{ created: number; skipped: number; duplicates: number; ok: boolean }> {
    let bookings: ChannexBooking[];
    try {
      bookings = await this.client.getBookings(cfg.channexPropertyId as string, since);
    } catch (err) {
      await this.writeLog(connectionId, 'PULL', 'BOOKING', 'FAILED', {
        request: since ? `since ${since.toISOString()}` : 'full window',
        error: ChannexSyncService.reason(err),
      });
      return { created: 0, skipped: 0, duplicates: 0, ok: false };
    }

    let created = 0;
    let skipped = 0;
    let duplicates = 0;
    for (const booking of bookings) {
      const result = await this.ingestBooking(connectionId, propertyId, cfg, booking);
      if (result === 'created') created += 1;
      else if (result === 'duplicate') duplicates += 1;
      else skipped += 1;
    }
    await this.writeLog(connectionId, 'PULL', 'BOOKING', 'SUCCESS', {
      request: since ? `since ${since.toISOString()}` : 'full window',
      response: `${bookings.length} fetched, ${created} created, ${duplicates} already present, ${skipped} skipped`,
    });
    return { created, skipped, duplicates, ok: true };
  }

  /**
   * One booking, idempotently.
   *
   * Idempotency is the Channex booking id, stamped on `reservations.external_ref`.
   * Checked BEFORE the create and stamped immediately after, so a redelivered
   * webhook or an overlapping scheduled run finds the row and stops.
   */
  async ingestBooking(
    connectionId: string,
    propertyId: string,
    cfg: ChannexConnectionConfig,
    booking: ChannexBooking,
  ): Promise<'created' | 'duplicate' | 'skipped'> {
    const externalRef = booking?.id;
    if (!externalRef) {
      await this.writeLog(connectionId, 'PULL', 'BOOKING', 'FAILED', {
        error: 'Channex booking had no id — cannot dedupe it, refusing to import',
      });
      return 'skipped';
    }

    try {
      const existing = await this.db
        .select({ id: reservationExternalRefs.id })
        .from(reservationExternalRefs)
        .where(
          and(
            eq(reservationExternalRefs.propertyId, propertyId),
            eq(reservationExternalRefs.externalRef, externalRef),
          ),
        )
        .limit(1);
      if (existing.length > 0) return 'duplicate';

      const attrs = booking.attributes ?? {};
      const status = (attrs.status ?? '').toLowerCase();
      if (status === 'cancelled' || status === 'canceled') {
        // Nothing to create; a cancellation for a booking we never took is a
        // no-op, and one we DID take is handled by the webhook path.
        await this.writeLog(connectionId, 'PULL', 'BOOKING', 'SUCCESS', {
          request: externalRef,
          response: 'cancelled booking with no local reservation — ignored',
        });
        return 'skipped';
      }

      const room = attrs.rooms?.[0];
      const channexRoomTypeId = room?.room_type_id;
      const taveloRoomTypeId = channexRoomTypeId
        ? invertRoomTypeMap(cfg)[channexRoomTypeId]
        : undefined;
      if (!taveloRoomTypeId) {
        // The single most common real-world failure: a room type added on the
        // channel and never mapped. Named explicitly so the fix is obvious.
        await this.writeLog(connectionId, 'PULL', 'BOOKING', 'FAILED', {
          request: externalRef,
          error: `Channex room type ${channexRoomTypeId ?? '(absent)'} is not mapped to a Tavelo room type — booking skipped`,
        });
        return 'skipped';
      }

      const checkIn = attrs.arrival_date ?? room?.checkin_date;
      const checkOut = attrs.departure_date ?? room?.checkout_date;
      if (!checkIn || !checkOut) {
        await this.writeLog(connectionId, 'PULL', 'BOOKING', 'FAILED', {
          request: externalRef,
          error: 'Channex booking had no arrival/departure dates — booking skipped',
        });
        return 'skipped';
      }

      const customer = attrs.customer ?? {};
      const guestName = [customer.name, customer.surname].filter(Boolean).join(' ').trim();
      const amount = Number(room?.amount ?? attrs.amount ?? 0);

      // Straight through the booking engine: the OTA gets the same overlap,
      // capacity and validation rules a walk-in gets, and no second opinion.
      const reservation = await this.reservations.create(
        propertyId,
        {
          roomTypeId: taveloRoomTypeId,
          guestName: guestName || 'OTA Guest',
          guestPhone: customer.phone || '0000000000',
          guestEmail: customer.mail,
          adults: room?.occupancy?.adults ?? 1,
          children: room?.occupancy?.children ?? 0,
          checkIn,
          checkOut,
          ratePaise: Number.isFinite(amount) && amount > 0 ? Math.round(amount * 100) : undefined,
          source: 'OTA',
          // An OTA booking is money already taken — it is committed, not a hold.
          status: 'CONFIRMED',
          notes: `Channex booking ${externalRef}`,
        },
        null,
      );

      await this.db
        .update(reservationExternalRefs)
        .set({ externalRef })
        .where(eq(reservationExternalRefs.id, reservation.id as string));

      await this.writeLog(connectionId, 'PULL', 'BOOKING', 'SUCCESS', {
        request: externalRef,
        response: `reservation ${reservation.id as string} created`,
      });
      return 'created';
    } catch (err) {
      await this.writeLog(connectionId, 'PULL', 'BOOKING', 'FAILED', {
        request: externalRef,
        error: ChannexSyncService.reason(err),
      });
      return 'skipped';
    }
  }

  /** Every Channex connection worth polling. DISCONNECTED ones are left alone. */
  async activeConnections() {
    return this.db
      .select()
      .from(integrationConnections)
      .where(
        and(
          eq(integrationConnections.provider, CHANNEX_PROVIDER),
          inArray(integrationConnections.status, ['HEALTHY', 'WARNING']),
        ),
      );
  }

  // ---------- Webhook ----------

  /**
   * Channex pushing a booking at us instead of us polling for it.
   *
   * Idempotency is claimed FIRST, on the unique index over `event_id`, exactly
   * as billing does with `webhook_events`: a redelivery loses the insert race
   * and returns `replayed`, so five deliveries of one booking create one
   * reservation. Processing then goes through the SAME `ingestBooking` the
   * polling path uses — there is no second import routine to drift.
   *
   * Always answers 2xx once the event is recorded. A channel manager has no
   * useful retry to make against a booking we have already durably stored, and
   * the failure is visible on the event row and in the sync log.
   */
  async handleWebhook(input: {
    payload: Record<string, unknown>;
    secret?: string;
    providedSecret?: string;
  }): Promise<{ ok: true; replayed: boolean; processed: boolean }> {
    if (input.secret) {
      // Constant-time is not warranted for a shared secret compared against a
      // header on an endpoint that is already rate-limited; a mismatch is a
      // flat refusal before anything is stored.
      if (input.providedSecret !== input.secret) throw ChannexErrors.badSignature();
    } else if (process.env.NODE_ENV === 'production') {
      // Belt-and-suspenders: env validation already blocks a prod boot with the
      // integration on and no secret, but never ingest an unverified event in
      // production even if that guard is somehow bypassed.
      throw ChannexErrors.badSignature();
    } else {
      this.log.warn(
        'CHANNEX_WEBHOOK_SECRET is unset; accepting Channex webhooks unverified (dev only)',
      );
    }

    const payload = input.payload ?? {};
    const eventId = ChannexSyncService.extractEventId(payload);

    let rowId: string;
    try {
      const [row] = await this.db
        .insert(channexWebhookEvents)
        .values({ eventId, payload: payload as never })
        .returning();
      rowId = row.id;
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? String(err);
      if (msg.includes('channex_webhook_events_event_id_unique') || msg.includes('duplicate key')) {
        return { ok: true, replayed: true, processed: false };
      }
      throw err;
    }

    try {
      const processed = await this.processWebhookPayload(payload);
      await this.db
        .update(channexWebhookEvents)
        .set({ processedAt: new Date() })
        .where(eq(channexWebhookEvents.id, rowId));
      return { ok: true, replayed: false, processed };
    } catch (err) {
      await this.db
        .update(channexWebhookEvents)
        .set({ error: ChannexSyncService.reason(err) })
        .where(eq(channexWebhookEvents.id, rowId));
      this.log.error(`Channex webhook ${eventId} failed to process`);
      return { ok: true, replayed: false, processed: false };
    }
  }

  /**
   * The event id Channex sends, or a deterministic fallback built from the
   * booking it is about. The fallback matters: without an id, two redeliveries
   * of the same booking would each get a fresh uuid and both would be
   * processed, which is exactly the bug this table exists to prevent.
   */
  static extractEventId(payload: Record<string, unknown>): string {
    const direct = payload.event_id ?? payload.id;
    if (typeof direct === 'string' && direct) return direct.slice(0, 191);
    const event = typeof payload.event === 'string' ? payload.event : 'event';
    const bookingId = ChannexSyncService.extractBookingId(payload);
    const revision = payload.revision_id ?? payload.timestamp ?? '';
    return `${event}:${bookingId ?? 'unknown'}:${String(revision)}`.slice(0, 191);
  }

  private static extractBookingId(payload: Record<string, unknown>): string | undefined {
    const payloadBlock = payload.payload as Record<string, unknown> | undefined;
    const candidate = payload.booking_id ?? payloadBlock?.booking_id ?? payloadBlock?.id;
    return typeof candidate === 'string' && candidate ? candidate : undefined;
  }

  /**
   * Booking created / modified / cancelled all resolve the same way: find the
   * connection the property belongs to, then re-read the booking FROM CHANNEX
   * and run it through `ingestBooking`. The webhook body is a notification,
   * not a source of truth — trusting its contents would let a spoofed post
   * write a reservation.
   */
  private async processWebhookPayload(payload: Record<string, unknown>): Promise<boolean> {
    if (!this.configured) throw ChannexErrors.notConfigured();
    const payloadBlock = (payload.payload as Record<string, unknown> | undefined) ?? {};
    const channexPropertyId =
      (typeof payload.property_id === 'string' && payload.property_id) ||
      (typeof payloadBlock.property_id === 'string' && payloadBlock.property_id) ||
      undefined;
    if (!channexPropertyId) throw new Error('Channex webhook carried no property_id');

    const connections = await this.activeConnections();
    const match = connections.find(
      (c) => readChannexConfig(c.config).channexPropertyId === channexPropertyId,
    );
    if (!match || !match.propertyId) {
      throw new Error(`No Channex connection maps to property ${channexPropertyId}`);
    }

    const cfg = readChannexConfig(match.config);
    const bookings = await this.client.getBookings(channexPropertyId, undefined);
    const bookingId = ChannexSyncService.extractBookingId(payload);
    const targets = bookingId ? bookings.filter((b) => b.id === bookingId) : bookings;
    for (const booking of targets) {
      await this.ingestBooking(match.id, match.propertyId, cfg, booking);
    }
    return targets.length > 0;
  }
}
