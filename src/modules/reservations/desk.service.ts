import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gt, gte, inArray, isNull, lt, lte, ne, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  hotelStaff,
  reservations,
  rooms,
  roomTypes,
  type Reservation,
  type RoomStatus,
} from '../../database/schema';
import { AvailabilityQueryDto } from './dto';
import { ReservationsService } from './reservations.service';
import { assertDateOrder, monthBounds, today, type IsoDate } from './reservation-rules';

/**
 * The two aggregate reads the apps open on: the reception desk board and the
 * GM dashboard.
 *
 * They are ONE call each on purpose. A dashboard that fires seven requests over
 * a hotel's wifi shows seven different loading spinners and four stale numbers;
 * every figure here comes from the same request and therefore the same instant.
 */
@Injectable()
export class DeskService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly reservationsService: ReservationsService,
  ) {}

  /** Rooms that are not OUT_OF_ORDER — the denominator for occupancy. */
  private async roomStatusCounts(propertyIds: string[]) {
    if (propertyIds.length === 0) return new Map<RoomStatus, number>();
    const rows = await this.db
      .select({ status: rooms.status, count: sql<number>`count(*)::int` })
      .from(rooms)
      .where(and(inArray(rooms.propertyId, propertyIds), isNull(rooms.deletedAt)))
      .groupBy(rooms.status);
    return new Map(rows.map((r) => [r.status, r.count] as const));
  }

  /**
   * Occupancy = OCCUPIED / (every live room that is not OUT_OF_ORDER).
   *
   * OUT_OF_ORDER rooms leave the denominator because they cannot be sold; a
   * hotel with a flooded wing is not failing to fill it. MAINTENANCE stays in —
   * it is a same-day state, not a withdrawal from inventory.
   */
  static occupancyPercent(counts: Map<RoomStatus, number>): number {
    let sellable = 0;
    for (const [status, n] of counts) if (status !== 'OUT_OF_ORDER') sellable += n;
    if (sellable === 0) return 0;
    return Math.round(((counts.get('OCCUPIED') ?? 0) / sellable) * 1000) / 10;
  }

  /**
   * Revenue booked against a calendar month, in paise.
   *
   * APPROXIMATION, deliberately and documented: it sums the FULL `total_paise`
   * of every CHECKED_OUT or CHECKED_IN reservation whose stay TOUCHES the
   * month, rather than apportioning each stay night-by-night. A booking
   * straddling month end therefore lands entirely in both months' figures.
   *
   * That is the right trade for a dashboard tile — it needs one indexed range
   * scan and no per-night expansion — but it is NOT an accounting number, and
   * the finance surface must not be built on it. Proper night-level
   * apportionment belongs with a folio/ledger table, which does not exist yet.
   *
   * PENDING, CANCELLED and NO_SHOW are excluded: no money is owed on them.
   */
  private async monthRevenuePaise(propertyIds: string[], monthOf: IsoDate): Promise<number> {
    if (propertyIds.length === 0) return 0;
    const { start, end } = monthBounds(monthOf);
    const [row] = await this.db
      .select({ total: sql<number>`coalesce(sum(${reservations.totalPaise}), 0)::bigint` })
      .from(reservations)
      .where(
        and(
          inArray(reservations.propertyId, propertyIds),
          isNull(reservations.deletedAt),
          inArray(reservations.status, ['CHECKED_IN', 'CHECKED_OUT']),
          // The same strict-inequality overlap the booking rules use.
          lt(reservations.checkIn, end),
          gt(reservations.checkOut, start),
        ),
      );
    return Number(row?.total ?? 0);
  }

  // ---------- Reception desk ----------

  /**
   * Everything the reception dashboard shows, in one call.
   *
   *   arrivals   — CONFIRMED, arriving today (still to be checked in)
   *   departures — CHECKED_IN, due out today
   *   inHouse    — CHECKED_IN and staying tonight
   */
  async today(propertyId: string, now: Date = new Date()) {
    const day = today(now);

    const base = [eq(reservations.propertyId, propertyId), isNull(reservations.deletedAt)];

    const arrivals = await this.db
      .select()
      .from(reservations)
      .where(and(...base, eq(reservations.status, 'CONFIRMED'), eq(reservations.checkIn, day)))
      .orderBy(asc(reservations.guestName));

    const departures = await this.db
      .select()
      .from(reservations)
      .where(and(...base, eq(reservations.status, 'CHECKED_IN'), eq(reservations.checkOut, day)))
      .orderBy(asc(reservations.guestName));

    // In-house means the guest sleeps here tonight: checked in, and today is
    // still inside [check_in, check_out). Departures are therefore NOT in-house.
    const inHouse = await this.db
      .select()
      .from(reservations)
      .where(
        and(
          ...base,
          eq(reservations.status, 'CHECKED_IN'),
          lte(reservations.checkIn, day),
          gt(reservations.checkOut, day),
        ),
      )
      .orderBy(asc(reservations.guestName));

    const [availableRooms] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(rooms)
      .where(
        and(
          eq(rooms.propertyId, propertyId),
          isNull(rooms.deletedAt),
          inArray(rooms.status, ['AVAILABLE', 'READY', 'INSPECTED']),
        ),
      );

    // Per-status room tallies for the board's housekeeping strip. One grouped
    // scan; READY + INSPECTED together are "ready to sell".
    const statusRows = await this.db
      .select({ status: rooms.status, count: sql<number>`count(*)::int` })
      .from(rooms)
      .where(and(eq(rooms.propertyId, propertyId), isNull(rooms.deletedAt)))
      .groupBy(rooms.status);
    const byStatus = new Map<RoomStatus, number>(
      statusRows.map((r) => [r.status, r.count] as const),
    );

    // Walk-ins taken TODAY (by creation time, not arrival date) — the desk's
    // own tally of business it brought in since midnight.
    const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const [walkIns] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(reservations)
      .where(
        and(
          ...base,
          eq(reservations.source, 'WALK_IN'),
          ne(reservations.status, 'CANCELLED'),
          gte(reservations.createdAt, startOfDay),
        ),
      );

    const hydrate = (rows: Reservation[]) => this.reservationsService.hydrate(rows);

    const hydratedDepartures = await hydrate(departures);
    const hydratedInHouse = await hydrate(inHouse);

    // Money still owed by guests who are here now or leaving today — computed
    // from the SAME rows the board renders, so the figure and the list agree.
    let pendingPaymentPaise = 0;
    let pendingFolios = 0;
    for (const r of [...hydratedDepartures, ...hydratedInHouse]) {
      const due = r.totalPaise - r.paidPaise;
      if (due > 0) {
        pendingPaymentPaise += due;
        pendingFolios += 1;
      }
    }

    return {
      date: day,
      arrivals: await hydrate(arrivals),
      departures: hydratedDepartures,
      inHouse: hydratedInHouse,
      counts: {
        arrivals: arrivals.length,
        departures: departures.length,
        inHouse: inHouse.length,
        availableRooms: availableRooms?.count ?? 0,
        roomsAvailable: byStatus.get('AVAILABLE') ?? 0,
        roomsDirty: byStatus.get('DIRTY') ?? 0,
        roomsReady: (byStatus.get('READY') ?? 0) + (byStatus.get('INSPECTED') ?? 0),
        walkInsToday: walkIns?.count ?? 0,
        pendingPaymentPaise,
        pendingFolios,
      },
    };
  }

  // ---------- GM dashboard ----------

  async dashboard(propertyId: string, now: Date = new Date()) {
    const day = today(now);
    const ids = [propertyId];
    const counts = await this.roomStatusCounts(ids);

    const base = [eq(reservations.propertyId, propertyId), isNull(reservations.deletedAt)];
    const [arrivals] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(reservations)
      .where(and(...base, eq(reservations.checkIn, day), ne(reservations.status, 'CANCELLED')));
    const [departures] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(reservations)
      .where(and(...base, eq(reservations.checkOut, day), eq(reservations.status, 'CHECKED_IN')));
    const [inHouse] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(reservations)
      .where(and(...base, eq(reservations.status, 'CHECKED_IN')));

    const [pendingApprovals] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(hotelStaff)
      .where(
        and(
          eq(hotelStaff.propertyId, propertyId),
          isNull(hotelStaff.deletedAt),
          eq(hotelStaff.status, 'PENDING_APPROVAL'),
        ),
      );

    let totalRooms = 0;
    for (const n of counts.values()) totalRooms += n;

    return {
      date: day,
      occupancy: DeskService.occupancyPercent(counts),
      rooms: {
        total: totalRooms,
        occupied: counts.get('OCCUPIED') ?? 0,
        available:
          (counts.get('AVAILABLE') ?? 0) +
          (counts.get('READY') ?? 0) +
          (counts.get('INSPECTED') ?? 0),
        dirty: (counts.get('DIRTY') ?? 0) + (counts.get('CLEANING') ?? 0),
        maintenance: (counts.get('MAINTENANCE') ?? 0) + (counts.get('OUT_OF_ORDER') ?? 0),
      },
      arrivalsToday: arrivals?.count ?? 0,
      departuresToday: departures?.count ?? 0,
      inHouse: inHouse?.count ?? 0,
      /** See `monthRevenuePaise` — a touching-the-month approximation. */
      monthRevenuePaise: await this.monthRevenuePaise(ids, day),
      pendingApprovals: pendingApprovals?.count ?? 0,
    };
  }

  // ---------- Availability, for the create form ----------

  /**
   * Free rooms per type for a date range — what the booking form's room-type
   * picker shows next to each option, so the desk never picks a sold-out type
   * and then gets refused.
   *
   * Uses exactly the rules the create path enforces, so the number the clerk
   * sees and the answer they get are the same rule.
   */
  async availability(propertyId: string, q: AvailabilityQueryDto) {
    assertDateOrder(q.checkIn, q.checkOut);

    const typeConds = [
      eq(roomTypes.propertyId, propertyId),
      isNull(roomTypes.deletedAt),
      eq(roomTypes.status, 'ACTIVE'),
    ];
    if (q.roomTypeId) typeConds.push(eq(roomTypes.id, q.roomTypeId));
    const types = await this.db
      .select()
      .from(roomTypes)
      .where(and(...typeConds))
      .orderBy(asc(roomTypes.name));
    if (types.length === 0) return { checkIn: q.checkIn, checkOut: q.checkOut, items: [] };

    const typeIds = types.map((t) => t.id);
    const roomRows = await this.db
      .select({ roomTypeId: rooms.roomTypeId, count: sql<number>`count(*)::int` })
      .from(rooms)
      .where(
        and(
          eq(rooms.propertyId, propertyId),
          isNull(rooms.deletedAt),
          inArray(rooms.roomTypeId, typeIds),
          ne(rooms.status, 'OUT_OF_ORDER' as RoomStatus),
        ),
      )
      .groupBy(rooms.roomTypeId);
    const sellable = new Map(roomRows.map((r) => [r.roomTypeId, r.count] as const));

    const bookedRows = await this.db
      .select({ roomTypeId: reservations.roomTypeId, count: sql<number>`count(*)::int` })
      .from(reservations)
      .where(
        and(
          eq(reservations.propertyId, propertyId),
          isNull(reservations.deletedAt),
          inArray(reservations.roomTypeId, typeIds),
          inArray(reservations.status, ['CONFIRMED', 'CHECKED_IN']),
          lt(reservations.checkIn, q.checkOut),
          gt(reservations.checkOut, q.checkIn),
        ),
      )
      .groupBy(reservations.roomTypeId);
    const booked = new Map(bookedRows.map((r) => [r.roomTypeId, r.count] as const));

    return {
      checkIn: q.checkIn,
      checkOut: q.checkOut,
      items: types.map((t) => {
        const total = sellable.get(t.id) ?? 0;
        const taken = booked.get(t.id) ?? 0;
        return {
          roomTypeId: t.id,
          name: t.name,
          bedType: t.bedType,
          maxOccupancy: t.maxOccupancy,
          baseRate: t.baseRate,
          currency: t.currency,
          totalRooms: total,
          bookedRooms: taken,
          availableRooms: Math.max(0, total - taken),
        };
      }),
    };
  }
}
