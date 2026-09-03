import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { and, asc, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  rateChangeLog,
  rateInventoryDays,
  rateOverrides,
  reservations,
  rooms,
  roomTypes,
  type ChannelDayOverride,
  type RateInventoryDay,
} from '../../database/schema';
import { addDays, coversDate, type IsoDate } from '../reservations/reservation-rules';

/** How many days one grid read or bulk edit may span. A year, plus slack. */
export const MAX_RATE_WINDOW_DAYS = 400;

/** One cell of the grid: what the day resolves to, and where each part came from. */
export interface RateDayCell {
  roomTypeId: string;
  date: IsoDate;
  pricePaise: number;
  /** 'day' (grid), 'override' (date-range), 'base' (room type). */
  priceSource: 'day' | 'override' | 'base';
  /** Rooms that may still be sold tonight after caps and stop-sell. */
  available: number;
  /** Physical rooms of the type not out of order. */
  physical: number;
  sold: number;
  /** The hotelier's cap on `available`, or null for "all of them". */
  cap: number | null;
  minLos: number | null;
  maxLos: number | null;
  stopSell: boolean;
  closedToArrival: boolean;
  closedToDeparture: boolean;
  channelOverrides: Record<string, ChannelDayOverride>;
  pricingRuleId: string | null;
}

/** The restrictions the booking path enforces for one type on one night. */
export interface DayRules {
  date: IsoDate;
  cap: number | null;
  minLos: number | null;
  maxLos: number | null;
  stopSell: boolean;
  closedToArrival: boolean;
  closedToDeparture: boolean;
}

export interface BulkUpdateInput {
  roomTypeIds: string[];
  ranges: { from: IsoDate; to: IsoDate }[];
  /** 0 = Sunday … 6 = Saturday. Omitted = every day in the ranges. */
  daysOfWeek?: number[];
  ratePlanId?: string | null;
  set: {
    pricePaise?: number | null;
    /** Relative change in basis points, applied to the RESOLVED price. */
    priceDeltaBp?: number;
    available?: number | null;
    minLos?: number | null;
    maxLos?: number | null;
    stopSell?: boolean;
    closedToArrival?: boolean;
    closedToDeparture?: boolean;
    /** Per-channel delta for one connection; null clears it. */
    channel?: { connectionId: string; override: ChannelDayOverride | null };
  };
  actorStaffId?: string | null;
  actorKind?: 'STAFF' | 'RULE' | 'CHANNEL' | 'IMPORT';
  pricingRuleId?: string | null;
}

type Tx = Pick<Database, 'select' | 'insert' | 'update'>;

/**
 * Rates & inventory.
 *
 * The day table is the unit of truth once a property uses it; before that,
 * and for any day it has not touched, the resolver falls through to the older
 * date-range overrides and then the room type's base rate — so a hotel that
 * never opens the grid keeps exactly the prices it has today.
 *
 * Every write goes through `bulkUpdate`, even a single cell, so there is one
 * code path, one change-log format, and one batch id per act.
 */
@Injectable()
export class RatesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // ------------------------------------------------------------ resolver --

  /**
   * The sell price for one type on each night of [from, to). Day row wins,
   * then a date-range override, then the base rate. One query per source for
   * the whole window, never per night.
   */
  async nightlyPrices(
    propertyId: string,
    roomTypeId: string,
    from: IsoDate,
    to: IsoDate,
    ratePlanId?: string | null,
    tx: Tx = this.db,
  ): Promise<{ date: IsoDate; pricePaise: number; source: RateDayCell['priceSource'] }[]> {
    RatesService.assertWindow(from, to);
    const [type] = await tx
      .select({ baseRate: roomTypes.baseRate })
      .from(roomTypes)
      .where(and(eq(roomTypes.id, roomTypeId), eq(roomTypes.propertyId, propertyId)))
      .limit(1);
    if (!type)
      throw new NotFoundException({ error: 'ROOM_TYPE_NOT_FOUND', message: 'Room type not found' });

    const days = await this.dayRows(propertyId, [roomTypeId], from, to, ratePlanId ?? null, tx);
    const overrides = await tx
      .select()
      .from(rateOverrides)
      .where(
        and(
          eq(rateOverrides.propertyId, propertyId),
          eq(rateOverrides.roomTypeId, roomTypeId),
          lte(rateOverrides.startDate, addDays(to, -1)),
          gte(rateOverrides.endDate, from),
          isNull(rateOverrides.deletedAt),
        ),
      )
      .orderBy(desc(rateOverrides.ratePaise));

    const out: { date: IsoDate; pricePaise: number; source: RateDayCell['priceSource'] }[] = [];
    for (let d = from; d < to; d = addDays(d, 1)) {
      const day = days.find((r) => r.roomTypeId === roomTypeId && r.date === d);
      if (day?.pricePaise != null) {
        out.push({ date: d, pricePaise: day.pricePaise, source: 'day' });
        continue;
      }
      const ov = overrides.find((o) => o.startDate <= d && o.endDate >= d);
      if (ov) {
        out.push({ date: d, pricePaise: ov.ratePaise, source: 'override' });
        continue;
      }
      out.push({ date: d, pricePaise: type.baseRate, source: 'base' });
    }
    return out;
  }

  /** The restrictions for one type on each night of [from, to). */
  async dayRules(
    propertyId: string,
    roomTypeId: string,
    from: IsoDate,
    to: IsoDate,
    tx: Tx = this.db,
  ): Promise<DayRules[]> {
    const days = await this.dayRows(propertyId, [roomTypeId], from, to, null, tx);
    const out: DayRules[] = [];
    for (let d = from; d < to; d = addDays(d, 1)) {
      const r = days.find((x) => x.date === d);
      out.push({
        date: d,
        cap: r?.available ?? null,
        minLos: r?.minLos ?? null,
        maxLos: r?.maxLos ?? null,
        stopSell: r?.stopSell ?? false,
        closedToArrival: r?.closedToArrival ?? false,
        closedToDeparture: r?.closedToDeparture ?? false,
      });
    }
    return out;
  }

  // ---------------------------------------------------------------- grid --

  /**
   * The rates & inventory grid: every active room type × every night in the
   * window, fully resolved. Four queries for the whole grid regardless of
   * size — types, rooms, day rows, overlapping stays — then arithmetic.
   */
  async grid(propertyId: string, from: IsoDate, to: IsoDate, ratePlanId?: string | null) {
    RatesService.assertWindow(from, to);
    const types = await this.db
      .select({
        id: roomTypes.id,
        name: roomTypes.name,
        baseRate: roomTypes.baseRate,
        isPrivate: roomTypes.isPrivate,
      })
      .from(roomTypes)
      .where(
        and(
          eq(roomTypes.propertyId, propertyId),
          isNull(roomTypes.deletedAt),
          eq(roomTypes.status, 'ACTIVE'),
        ),
      )
      .orderBy(asc(roomTypes.name));
    if (types.length === 0) return { from, to, ratePlanId: ratePlanId ?? null, roomTypes: [] };
    const typeIds = types.map((t) => t.id);

    const physicalRows = await this.db
      .select({ roomTypeId: rooms.roomTypeId, count: sql<number>`count(*)::int` })
      .from(rooms)
      .where(
        and(
          eq(rooms.propertyId, propertyId),
          isNull(rooms.deletedAt),
          sql`${rooms.status} <> 'OUT_OF_ORDER'`,
        ),
      )
      .groupBy(rooms.roomTypeId);
    const physical = new Map(physicalRows.map((r) => [r.roomTypeId, Number(r.count)]));

    const days = await this.dayRows(propertyId, typeIds, from, to, ratePlanId ?? null);
    const overrides = await this.db
      .select()
      .from(rateOverrides)
      .where(
        and(
          eq(rateOverrides.propertyId, propertyId),
          inArray(rateOverrides.roomTypeId, typeIds),
          lte(rateOverrides.startDate, addDays(to, -1)),
          gte(rateOverrides.endDate, from),
          isNull(rateOverrides.deletedAt),
        ),
      );
    const stays = await this.db
      .select({
        roomTypeId: reservations.roomTypeId,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
      })
      .from(reservations)
      .where(
        and(
          eq(reservations.propertyId, propertyId),
          inArray(reservations.status, ['CONFIRMED', 'CHECKED_IN']),
          isNull(reservations.deletedAt),
          sql`${reservations.checkIn} < ${to}`,
          sql`${reservations.checkOut} > ${from}`,
        ),
      );

    return {
      from,
      to,
      ratePlanId: ratePlanId ?? null,
      roomTypes: types.map((t) => {
        const total = physical.get(t.id) ?? 0;
        const cells: RateDayCell[] = [];
        for (let d = from; d < to; d = addDays(d, 1)) {
          const day = days.find((r) => r.roomTypeId === t.id && r.date === d);
          const ov = overrides.find(
            (o) => o.roomTypeId === t.id && o.startDate <= d && o.endDate >= d,
          );
          const price = day?.pricePaise ?? ov?.ratePaise ?? t.baseRate;
          const source: RateDayCell['priceSource'] =
            day?.pricePaise != null ? 'day' : ov ? 'override' : 'base';
          const sold = stays.filter((s) => s.roomTypeId === t.id && coversDate(s, d)).length;
          const cap = day?.available ?? null;
          const free = Math.max(0, total - sold);
          const available = day?.stopSell ? 0 : cap == null ? free : Math.min(cap, free);
          cells.push({
            roomTypeId: t.id,
            date: d,
            pricePaise: price,
            priceSource: source,
            available,
            physical: total,
            sold,
            cap,
            minLos: day?.minLos ?? null,
            maxLos: day?.maxLos ?? null,
            stopSell: day?.stopSell ?? false,
            closedToArrival: day?.closedToArrival ?? false,
            closedToDeparture: day?.closedToDeparture ?? false,
            channelOverrides: day?.channelOverrides ?? {},
            pricingRuleId: day?.pricingRuleId ?? null,
          });
        }
        return {
          id: t.id,
          name: t.name,
          baseRatePaise: t.baseRate,
          isPrivate: t.isPrivate,
          physical: total,
          days: cells,
        };
      }),
    };
  }

  // ---------------------------------------------------------------- bulk --

  /**
   * The one write path. Expands the request into (type, date) cells, reads
   * the existing rows in one query, upserts each changed cell, and logs every
   * field that actually changed under one batch id. Unchanged cells write
   * nothing — a bulk "set min stay 2" over a month that already has it is a
   * no-op with an empty log, not thirty identical entries.
   */
  async bulkUpdate(propertyId: string, input: BulkUpdateInput) {
    if (input.roomTypeIds.length === 0)
      throw new BadRequestException('Choose at least one room type');
    if (input.ranges.length === 0) throw new BadRequestException('Choose at least one date range');
    for (const r of input.ranges) RatesService.assertWindow(r.from, addDays(r.to, 1));

    const owned = await this.db
      .select({ id: roomTypes.id })
      .from(roomTypes)
      .where(
        and(
          eq(roomTypes.propertyId, propertyId),
          inArray(roomTypes.id, input.roomTypeIds),
          isNull(roomTypes.deletedAt),
        ),
      );
    if (owned.length !== new Set(input.roomTypeIds).size) {
      throw new NotFoundException({ error: 'ROOM_TYPE_NOT_FOUND', message: 'Room type not found' });
    }

    // Expand to the target dates (inclusive ranges, optional weekday filter).
    const dates = new Set<IsoDate>();
    for (const r of input.ranges) {
      for (let d = r.from; d <= r.to; d = addDays(d, 1)) {
        if (
          input.daysOfWeek?.length &&
          !input.daysOfWeek.includes(new Date(`${d}T00:00:00Z`).getUTCDay())
        )
          continue;
        dates.add(d);
      }
    }
    const dateList = [...dates].sort();
    if (dateList.length === 0) return { batchId: null, cells: 0, changed: 0 };
    const from = dateList[0];
    const to = addDays(dateList[dateList.length - 1], 1);
    const planId = input.ratePlanId ?? null;

    const batchId = randomUUID();
    const now = new Date();
    let changed = 0;

    await this.db.transaction(async (tx) => {
      const existing = await this.dayRows(
        propertyId,
        input.roomTypeIds,
        from,
        to,
        planId,
        tx as unknown as Tx,
      );
      // A relative price change needs the resolved price per cell, which may
      // come from an override or the base rate when no day row exists yet.
      const resolved = new Map<string, number>();
      if (input.set.priceDeltaBp !== undefined) {
        for (const typeId of input.roomTypeIds) {
          const nightly = await this.nightlyPrices(
            propertyId,
            typeId,
            from,
            to,
            planId,
            tx as unknown as Tx,
          );
          for (const n of nightly) resolved.set(`${typeId}|${n.date}`, n.pricePaise);
        }
      }

      for (const typeId of input.roomTypeIds) {
        for (const date of dateList) {
          const before = existing.find((r) => r.roomTypeId === typeId && r.date === date) ?? null;
          const next: Partial<typeof rateInventoryDays.$inferInsert> = {};
          const log: {
            field: (typeof rateChangeLog.$inferInsert)['field'];
            before: unknown;
            after: unknown;
          }[] = [];

          const want = (
            field: (typeof rateChangeLog.$inferInsert)['field'],
            key: keyof RateInventoryDay,
            value: unknown,
          ) => {
            const prev = before ? (before[key] as unknown) : null;
            if (JSON.stringify(prev ?? null) === JSON.stringify(value ?? null)) return;
            (next as Record<string, unknown>)[key] = value;
            log.push({ field, before: prev ?? null, after: value ?? null });
          };

          if (input.set.pricePaise !== undefined) want('price', 'pricePaise', input.set.pricePaise);
          if (input.set.priceDeltaBp !== undefined) {
            const base = resolved.get(`${typeId}|${date}`) ?? 0;
            want(
              'price',
              'pricePaise',
              Math.max(0, Math.round((base * (10_000 + input.set.priceDeltaBp)) / 10_000)),
            );
          }
          if (input.set.available !== undefined)
            want('available', 'available', input.set.available);
          if (input.set.minLos !== undefined) want('min_los', 'minLos', input.set.minLos);
          if (input.set.maxLos !== undefined) want('max_los', 'maxLos', input.set.maxLos);
          if (input.set.stopSell !== undefined) want('stop_sell', 'stopSell', input.set.stopSell);
          if (input.set.closedToArrival !== undefined)
            want('cta', 'closedToArrival', input.set.closedToArrival);
          if (input.set.closedToDeparture !== undefined)
            want('ctd', 'closedToDeparture', input.set.closedToDeparture);
          if (input.set.channel) {
            const cur = { ...(before?.channelOverrides ?? {}) };
            if (input.set.channel.override)
              cur[input.set.channel.connectionId] = input.set.channel.override;
            else delete cur[input.set.channel.connectionId];
            want('channel', 'channelOverrides', cur);
          }
          if (log.length === 0) continue;

          // A price written by a rule is tagged; a hand-typed one clears the
          // tag, so auto-revert later knows which prices are the rule's to undo.
          if ('pricePaise' in next)
            next.pricingRuleId = input.actorKind === 'RULE' ? (input.pricingRuleId ?? null) : null;
          next.updatedBy = input.actorStaffId ?? null;
          next.updatedAt = now;

          if (before) {
            await tx.update(rateInventoryDays).set(next).where(eq(rateInventoryDays.id, before.id));
          } else {
            await tx
              .insert(rateInventoryDays)
              .values({ propertyId, roomTypeId: typeId, ratePlanId: planId, date, ...next });
          }
          await tx.insert(rateChangeLog).values(
            log.map((l) => ({
              propertyId,
              roomTypeId: typeId,
              ratePlanId: planId,
              date,
              field: l.field,
              before: l.before as never,
              after: l.after as never,
              actorKind: input.actorKind ?? 'STAFF',
              actorStaffId: input.actorStaffId ?? null,
              pricingRuleId: input.pricingRuleId ?? null,
              batchId,
            })),
          );
          changed += 1;
        }
      }
    });

    return { batchId, cells: input.roomTypeIds.length * dateList.length, changed };
  }

  // ---------------------------------------------------------- change log --

  async changes(
    propertyId: string,
    q: {
      roomTypeId?: string;
      from?: IsoDate;
      to?: IsoDate;
      batchId?: string;
      limit?: number;
      offset?: number;
    },
  ) {
    const conds = [eq(rateChangeLog.propertyId, propertyId)];
    if (q.roomTypeId) conds.push(eq(rateChangeLog.roomTypeId, q.roomTypeId));
    if (q.from) conds.push(gte(rateChangeLog.date, q.from));
    if (q.to) conds.push(lte(rateChangeLog.date, q.to));
    if (q.batchId) conds.push(eq(rateChangeLog.batchId, q.batchId));
    const limit = Math.min(q.limit ?? 100, 500);
    const offset = q.offset ?? 0;
    const items = await this.db
      .select()
      .from(rateChangeLog)
      .where(and(...conds))
      .orderBy(desc(rateChangeLog.createdAt))
      .limit(limit)
      .offset(offset);
    return { items, limit, offset };
  }

  // ------------------------------------------------------------ overrides --
  // The older date-range overrides stay as a fallback source (see resolver).

  async list(propertyId: string) {
    return this.db
      .select()
      .from(rateOverrides)
      .where(and(eq(rateOverrides.propertyId, propertyId), isNull(rateOverrides.deletedAt)))
      .orderBy(asc(rateOverrides.startDate));
  }

  async create(
    propertyId: string,
    dto: {
      roomTypeId: string;
      startDate: string;
      endDate: string;
      ratePaise: number;
      label?: string;
    },
  ) {
    if (dto.endDate < dto.startDate)
      throw new BadRequestException('endDate must not be before startDate');
    const [type] = await this.db
      .select({ id: roomTypes.id })
      .from(roomTypes)
      .where(
        and(
          eq(roomTypes.id, dto.roomTypeId),
          eq(roomTypes.propertyId, propertyId),
          isNull(roomTypes.deletedAt),
        ),
      )
      .limit(1);
    if (!type) throw new NotFoundException('Room type not found');
    const [row] = await this.db
      .insert(rateOverrides)
      .values({
        propertyId,
        roomTypeId: dto.roomTypeId,
        label: dto.label ?? null,
        startDate: dto.startDate,
        endDate: dto.endDate,
        ratePaise: dto.ratePaise,
      })
      .returning();
    return row;
  }

  async remove(propertyId: string, id: string) {
    const [row] = await this.db
      .update(rateOverrides)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(rateOverrides.id, id), eq(rateOverrides.propertyId, propertyId)))
      .returning();
    if (!row) throw new NotFoundException('Rate override not found');
    return { deleted: true, id };
  }

  // ------------------------------------------------------------- helpers --

  private async dayRows(
    propertyId: string,
    typeIds: string[],
    from: IsoDate,
    to: IsoDate,
    ratePlanId: string | null,
    tx: Tx = this.db,
  ): Promise<RateInventoryDay[]> {
    if (typeIds.length === 0) return [];
    return tx
      .select()
      .from(rateInventoryDays)
      .where(
        and(
          eq(rateInventoryDays.propertyId, propertyId),
          inArray(rateInventoryDays.roomTypeId, typeIds),
          gte(rateInventoryDays.date, from),
          sql`${rateInventoryDays.date} < ${to}`,
          ratePlanId
            ? eq(rateInventoryDays.ratePlanId, ratePlanId)
            : isNull(rateInventoryDays.ratePlanId),
        ),
      );
  }

  static assertWindow(from: IsoDate, to: IsoDate): void {
    if (!(to > from)) throw new BadRequestException('The window must end after it starts');
    const days = Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);
    if (days > MAX_RATE_WINDOW_DAYS) {
      throw new BadRequestException(`A window may span at most ${MAX_RATE_WINDOW_DAYS} days`);
    }
  }
}
