import { Inject, Injectable, Optional } from '@nestjs/common';
import { and, asc, desc, eq, gt, gte, inArray, isNull, lt, lte, ne, or, sql, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { FolioService } from '../folio/folio.service';
import {
  OCCUPYING_STATUSES,
  rateOverrides,
  reservationEvents,
  reservations,
  rooms,
  roomTypes,
  type Reservation,
  type ReservationStatus,
  type RoomStatus,
} from '../../database/schema';
import {
  AssignRoomDto,
  CancelReservationDto,
  CheckInDto,
  CheckOutDto,
  CreateReservationDto,
  ReservationFilterDto,
  UpdateReservationDto,
} from './dto';
import { ReservationErrors } from './reservation-errors';
import { HousekeepingService } from '../housekeeping/housekeeping.service';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service';
import {
  ASSIGNABLE_ROOM_STATUSES,
  addDays,
  assertDateOrder,
  assertTransition,
  coversDate,
  formatReservationNumber,
  nightsBetween,
  today,
  totalPaise,
  type IsoDate,
} from './reservation-rules';

const MAX_LIMIT = 200;
/** Reservation numbers are derived from a count; a concurrent create can race. */
const NUMBER_ATTEMPTS = 5;

/** Any transaction handle or the pool itself — both expose the same query API. */
type Tx = Pick<Database, 'select' | 'insert' | 'update' | 'delete'>;

/**
 * Reservations — the booking engine.
 *
 * Three rules run through every method:
 *
 *  1. TENANT ISOLATION. A reservation, a room and a room type are only ever
 *     resolved by (id, propertyId = the caller's own). Cross-property reads
 *     404, indistinguishable from a miss — never 403.
 *
 *  2. NO DOUBLE BOOKING. A room cannot hold two overlapping reservations in
 *     CONFIRMED or CHECKED_IN. The check runs INSIDE the transaction that does
 *     the write, over rows locked with SELECT ... FOR UPDATE, so two clerks
 *     confirming the same room at the same moment cannot both win. Checking
 *     before the transaction would be a time-of-check/time-of-use bug that
 *     shows up exactly on the busy evening it must not.
 *
 *  3. ONE TRANSITION MAP. Every status change goes through `assertTransition`
 *     in reservation-rules.ts. There is no second opinion anywhere in here.
 */
@Injectable()
export class ReservationsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly folio: FolioService,
    // Optional so unit tests that construct the service directly stay valid and
    // so a missing notifications wiring can never block a booking.
    @Optional() private readonly notifications?: NotificationDeliveryService,
  ) {}

  /**
   * Tell the guest about their own booking, on their own contact details.
   *
   * Guests are not app users, so this is SMS (always — guest_phone is required)
   * plus email when we have one. Best-effort and post-commit: a notification
   * failure must never undo a check-in. Templates that don't exist for a
   * channel simply record a SKIPPED delivery.
   */
  private notifyGuestQuietly(
    key: string,
    r: {
      id: string;
      guestName: string;
      guestPhone: string | null;
      guestEmail: string | null;
      reservationNumber: string;
      checkIn: string;
      checkOut: string;
      propertyName?: string | null;
    },
  ): void {
    if (!this.notifications) return;
    void this.notifications.notifyQuietly({
      key,
      relatedType: 'reservation',
      relatedId: r.id,
      targets: [
        { channel: 'SMS', to: r.guestPhone ?? '' },
        { channel: 'EMAIL', to: r.guestEmail ?? '' },
      ],
      vars: {
        guestName: r.guestName,
        reservationNumber: r.reservationNumber,
        propertyName: r.propertyName ?? 'the hotel',
        checkIn: r.checkIn,
        checkOut: r.checkOut,
      },
    });
  }

  // ---------- Shared predicates ----------

  /**
   * The reservations that OCCUPY a room: committed, not deleted, and
   * overlapping [checkIn, checkOut).
   *
   * The overlap is `existing.check_in < checkOut AND checkIn < existing.check_out`
   * — both STRICT. That is what makes same-day turnover legal: a stay ending on
   * the 15th does not collide with one starting on the 15th. See `overlaps()`
   * in reservation-rules.ts, which is the same rule in memory.
   */
  private static occupyingOverlap(checkIn: IsoDate, checkOut: IsoDate, excludeId?: string): SQL[] {
    const conds: SQL[] = [
      isNull(reservations.deletedAt),
      inArray(reservations.status, [...OCCUPYING_STATUSES]),
      lt(reservations.checkIn, checkOut),
      gt(reservations.checkOut, checkIn),
    ];
    if (excludeId) conds.push(ne(reservations.id, excludeId));
    return conds;
  }

  /**
   * Refuse if the room already holds an overlapping committed reservation.
   *
   * Takes `tx` rather than `this.db` on purpose, and locks the candidate rows:
   * the check and the write that depends on it commit together.
   */
  private static async assertRoomFree(
    tx: Tx,
    propertyId: string,
    roomId: string,
    checkIn: IsoDate,
    checkOut: IsoDate,
    excludeId?: string,
  ): Promise<void> {
    const clashes = await tx
      .select({ id: reservations.id })
      .from(reservations)
      .where(
        and(
          eq(reservations.propertyId, propertyId),
          eq(reservations.roomId, roomId),
          ...ReservationsService.occupyingOverlap(checkIn, checkOut, excludeId),
        ),
      )
      // Locks the clashing rows for the life of the transaction so a
      // simultaneous confirm cannot slip a booking in behind this check.
      .for('update')
      .limit(1);
    if (clashes.length > 0) throw ReservationErrors.roomUnavailable();
  }

  /**
   * Refuse if any SINGLE NIGHT of the stay is fully sold for this room type.
   *
   * The comparison is "committed reservations of this type covering that night"
   * against "live rooms of this type that are not OUT_OF_ORDER". A PER-NIGHT
   * check, not an interval one: three one-night stays on three different nights
   * are three separate nights, so against two rooms they all fit — the old
   * interval count refused that wrongly. It still never oversells, because a
   * night is only blocked once its own occupancy reaches the room count.
   */
  private static async assertTypeCapacity(
    tx: Tx,
    propertyId: string,
    roomTypeId: string,
    checkIn: IsoDate,
    checkOut: IsoDate,
    excludeId?: string,
  ): Promise<void> {
    const [{ count: roomCount }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(rooms)
      .where(
        and(
          eq(rooms.propertyId, propertyId),
          eq(rooms.roomTypeId, roomTypeId),
          isNull(rooms.deletedAt),
          ne(rooms.status, 'OUT_OF_ORDER' as RoomStatus),
        ),
      );
    const rooms_ = roomCount ?? 0;

    const overlapping = await tx
      .select({ checkIn: reservations.checkIn, checkOut: reservations.checkOut })
      .from(reservations)
      .where(
        and(
          eq(reservations.propertyId, propertyId),
          eq(reservations.roomTypeId, roomTypeId),
          ...ReservationsService.occupyingOverlap(checkIn, checkOut, excludeId),
        ),
      )
      // Locks the candidate rows so a simultaneous confirm cannot slip past the
      // per-night count between here and the write.
      .for('update');

    // Walk each night of the requested window; block on the first that is full.
    const nights = nightsBetween(checkIn, checkOut);
    for (let i = 0; i < nights; i += 1) {
      const night = addDays(checkIn, i);
      let sold = 0;
      for (const s of overlapping) {
        // A stay covers `night` when check_in <= night < check_out.
        if ((s.checkIn as IsoDate) <= night && night < (s.checkOut as IsoDate)) sold += 1;
      }
      if (sold >= rooms_) throw ReservationErrors.noAvailability(night);
    }
  }

  /** Append-only trail. Always written with the same `tx` as the change. */
  private static async recordEvent(
    tx: Tx,
    reservationId: string,
    type: string,
    actorStaffId: string | null,
    payload?: Record<string, unknown>,
  ): Promise<void> {
    await tx.insert(reservationEvents).values({
      reservationId,
      type,
      actorStaffId,
      payload: (payload ?? null) as never,
    });
  }

  // ---------- Resolution ----------

  /** The single choke point: (id, propertyId, not deleted) or 404. */
  async requireReservation(propertyId: string, id: string): Promise<Reservation> {
    const [row] = await this.db
      .select()
      .from(reservations)
      .where(
        and(
          eq(reservations.id, id),
          eq(reservations.propertyId, propertyId),
          isNull(reservations.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw ReservationErrors.notFound();
    return row;
  }

  private async requireRoomType(propertyId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(roomTypes)
      .where(
        and(
          eq(roomTypes.id, id),
          eq(roomTypes.propertyId, propertyId),
          isNull(roomTypes.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw ReservationErrors.roomTypeNotFound();
    return row;
  }

  /**
   * The per-night rate to quote for a booking arriving on `date`: a date-ranged
   * rate override for the room type if one covers the date, else the type's base
   * rate. When several overrides overlap, the highest wins (peak beats a
   * standing discount). First cut of rate plans — one rate for the stay, from
   * the arrival date.
   */
  private async resolveRate(
    propertyId: string,
    roomTypeId: string,
    date: string,
    fallback: number,
  ): Promise<number> {
    const [ov] = await this.db
      .select({ ratePaise: rateOverrides.ratePaise })
      .from(rateOverrides)
      .where(
        and(
          eq(rateOverrides.propertyId, propertyId),
          eq(rateOverrides.roomTypeId, roomTypeId),
          lte(rateOverrides.startDate, date),
          gte(rateOverrides.endDate, date),
          isNull(rateOverrides.deletedAt),
        ),
      )
      .orderBy(desc(rateOverrides.ratePaise))
      .limit(1);
    return ov?.ratePaise ?? fallback;
  }

  private async requireRoom(propertyId: string, id: string) {
    const [row] = await this.db
      .select()
      .from(rooms)
      .where(and(eq(rooms.id, id), eq(rooms.propertyId, propertyId), isNull(rooms.deletedAt)))
      .limit(1);
    if (!row) throw ReservationErrors.roomNotFound();
    return row;
  }

  // ---------- Reads ----------

  static conditions(propertyId: string, params: ReservationFilterDto): SQL[] {
    const conds: SQL[] = [eq(reservations.propertyId, propertyId), isNull(reservations.deletedAt)];
    if (params.status) conds.push(eq(reservations.status, params.status as ReservationStatus));
    // `from`/`to` describe a WINDOW the stay must touch, not the arrival date:
    // a guest already in-house on the 3rd belongs in a 3rd–5th report even
    // though they arrived on the 1st. Same strict-inequality overlap as above.
    if (params.to) conds.push(lt(reservations.checkIn, params.to));
    if (params.from) conds.push(gt(reservations.checkOut, params.from));
    if (params.roomId) conds.push(eq(reservations.roomId, params.roomId));
    if (params.q) {
      const like = `%${params.q}%`;
      conds.push(
        or(
          sql`${reservations.guestName} ILIKE ${like}`,
          sql`${reservations.guestPhone} ILIKE ${like}`,
          sql`${reservations.reservationNumber} ILIKE ${like}`,
        ) as SQL,
      );
    }
    return conds;
  }

  static toDto(
    r: Reservation,
    type?: { id: string; name: string },
    room?: { id: string; number: string; status: string },
  ) {
    return {
      id: r.id,
      propertyId: r.propertyId,
      reservationNumber: r.reservationNumber,
      roomTypeId: r.roomTypeId,
      roomTypeName: type?.name ?? null,
      roomId: r.roomId,
      roomNumber: room?.number ?? null,
      roomStatus: room?.status ?? null,
      guestName: r.guestName,
      guestPhone: r.guestPhone,
      guestEmail: r.guestEmail,
      guestIdType: r.guestIdType,
      guestIdNumber: r.guestIdNumber,
      adults: r.adults,
      children: r.children,
      checkIn: r.checkIn,
      checkOut: r.checkOut,
      nights: nightsBetween(r.checkIn, r.checkOut),
      status: r.status,
      ratePaise: r.ratePaise,
      totalPaise: r.totalPaise,
      paidPaise: r.paidPaise,
      balancePaise: r.totalPaise - r.paidPaise,
      currency: r.currency,
      source: r.source,
      notes: r.notes,
      checkedInAt: r.checkedInAt,
      checkedOutAt: r.checkedOutAt,
      cancelledAt: r.cancelledAt,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  /** Two extra queries for a page, regardless of its size. */
  async hydrate(rows: Reservation[]) {
    if (rows.length === 0) return [];
    const typeIds = [...new Set(rows.map((r) => r.roomTypeId))];
    const typeRows = await this.db
      .select({ id: roomTypes.id, name: roomTypes.name })
      .from(roomTypes)
      .where(inArray(roomTypes.id, typeIds));
    const typeById = new Map(typeRows.map((t) => [t.id, t]));

    const roomIds = [...new Set(rows.map((r) => r.roomId).filter((x): x is string => !!x))];
    const roomById = new Map<string, { id: string; number: string; status: string }>();
    if (roomIds.length) {
      const roomRows = await this.db
        .select({ id: rooms.id, number: rooms.number, status: rooms.status })
        .from(rooms)
        .where(inArray(rooms.id, roomIds));
      for (const r of roomRows) roomById.set(r.id, r);
    }

    return rows.map((r) =>
      ReservationsService.toDto(
        r,
        typeById.get(r.roomTypeId),
        r.roomId ? roomById.get(r.roomId) : undefined,
      ),
    );
  }

  async list(propertyId: string, params: ReservationFilterDto = {}) {
    const limit = Math.min(params.limit ?? 50, MAX_LIMIT);
    const offset = params.offset ?? 0;
    const where = and(...ReservationsService.conditions(propertyId, params));

    const rows = await this.db
      .select()
      .from(reservations)
      // Soonest arrival first — the desk works forwards through the day.
      .orderBy(asc(reservations.checkIn), desc(reservations.createdAt))
      .where(where)
      .limit(limit)
      .offset(offset);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(reservations)
      .where(where);

    return { items: await this.hydrate(rows), total: count, limit, offset };
  }

  async get(propertyId: string, id: string) {
    const row = await this.requireReservation(propertyId, id);
    const [dto] = await this.hydrate([row]);
    const events = await this.db
      .select()
      .from(reservationEvents)
      .where(eq(reservationEvents.reservationId, id))
      .orderBy(asc(reservationEvents.createdAt));
    return { ...dto, events };
  }

  // ---------- Create ----------

  async create(propertyId: string, dto: CreateReservationDto, actorStaffId: string | null) {
    assertDateOrder(dto.checkIn, dto.checkOut);
    // Both 404 BEFORE the transaction opens, so a bad request is never a
    // rolled-back write.
    const type = await this.requireRoomType(propertyId, dto.roomTypeId);
    if (dto.roomId) {
      const room = await this.requireRoom(propertyId, dto.roomId);
      if (room.roomTypeId !== dto.roomTypeId) throw ReservationErrors.roomTypeMismatch();
    }

    // The rate is SNAPSHOTTED here, not read at check-out: a base-rate change
    // next week must not rewrite what this guest was quoted today.
    const ratePaise =
      dto.ratePaise ?? (await this.resolveRate(propertyId, type.id, dto.checkIn, type.baseRate));
    const status: ReservationStatus = dto.status ?? 'PENDING';

    for (let attempt = 0; attempt < NUMBER_ATTEMPTS; attempt += 1) {
      try {
        const row = await this.db.transaction(async (tx) => {
          const handle = tx as unknown as Tx;
          // PENDING is a soft hold and blocks nothing, so it skips both checks.
          if (status === 'CONFIRMED') {
            if (dto.roomId) {
              await ReservationsService.assertRoomFree(
                handle,
                propertyId,
                dto.roomId,
                dto.checkIn,
                dto.checkOut,
              );
            }
            await ReservationsService.assertTypeCapacity(
              handle,
              propertyId,
              dto.roomTypeId,
              dto.checkIn,
              dto.checkOut,
            );
          }

          const [{ count }] = await handle
            .select({ count: sql<number>`count(*)::int` })
            .from(reservations)
            .where(eq(reservations.propertyId, propertyId));

          const [created] = await handle
            .insert(reservations)
            .values({
              propertyId,
              roomTypeId: dto.roomTypeId,
              roomId: dto.roomId ?? null,
              groupId: dto.groupId ?? null,
              reservationNumber: formatReservationNumber((count ?? 0) + 1 + attempt),
              guestName: dto.guestName,
              guestPhone: dto.guestPhone,
              guestEmail: dto.guestEmail ?? null,
              guestIdType: dto.guestIdType ?? null,
              guestIdNumber: dto.guestIdNumber ?? null,
              adults: dto.adults,
              children: dto.children ?? 0,
              checkIn: dto.checkIn,
              checkOut: dto.checkOut,
              status,
              ratePaise,
              totalPaise: totalPaise(ratePaise, dto.checkIn, dto.checkOut),
              currency: type.currency,
              source: dto.source ?? 'WALK_IN',
              notes: dto.notes ?? null,
              createdBy: actorStaffId,
            })
            .returning();

          await ReservationsService.recordEvent(handle, created.id, 'created', actorStaffId, {
            status,
            checkIn: dto.checkIn,
            checkOut: dto.checkOut,
          });
          return created;
        });

        const [hydrated] = await this.hydrate([row]);
        // A booking that lands already CONFIRMED (walk-in, or a synced OTA
        // booking) is a confirmation the guest should hear about immediately.
        if (hydrated.status === 'CONFIRMED') {
          this.notifyGuestQuietly('booking.confirmed', hydrated);
        }
        return hydrated;
      } catch (err) {
        // Only the reservation-number unique is worth retrying; a concurrent
        // create took the number this one computed.
        if ((err as { code?: string }).code === '23505' && attempt < NUMBER_ATTEMPTS - 1) {
          continue;
        }
        throw err;
      }
    }
    /* istanbul ignore next — the loop above either returns or rethrows. */
    throw ReservationErrors.notFound();
  }

  // ---------- Update ----------

  async update(
    propertyId: string,
    id: string,
    dto: UpdateReservationDto,
    actorStaffId: string | null,
  ) {
    const before = await this.requireReservation(propertyId, id);

    const movingDates = dto.checkIn !== undefined || dto.checkOut !== undefined;
    if (movingDates && before.status !== 'PENDING' && before.status !== 'CONFIRMED') {
      throw ReservationErrors.datesLocked();
    }
    const checkIn = dto.checkIn ?? before.checkIn;
    const checkOut = dto.checkOut ?? before.checkOut;
    if (movingDates) assertDateOrder(checkIn, checkOut);

    const patch: Partial<typeof reservations.$inferInsert> = { updatedAt: new Date() };
    if (dto.guestName !== undefined) patch.guestName = dto.guestName;
    if (dto.guestPhone !== undefined) patch.guestPhone = dto.guestPhone;
    if (dto.guestEmail !== undefined) patch.guestEmail = dto.guestEmail;
    if (dto.guestIdType !== undefined) patch.guestIdType = dto.guestIdType;
    if (dto.guestIdNumber !== undefined) patch.guestIdNumber = dto.guestIdNumber;
    if (dto.adults !== undefined) patch.adults = dto.adults;
    if (dto.children !== undefined) patch.children = dto.children;
    if (dto.source !== undefined) patch.source = dto.source;
    if (dto.notes !== undefined) patch.notes = dto.notes;
    if (dto.checkIn !== undefined) patch.checkIn = dto.checkIn;
    if (dto.checkOut !== undefined) patch.checkOut = dto.checkOut;

    // The total is DERIVED — never accepted from the client — so rate and
    // dates can only ever agree with it.
    const ratePaise = dto.ratePaise ?? before.ratePaise;
    if (dto.ratePaise !== undefined) patch.ratePaise = dto.ratePaise;
    if (dto.ratePaise !== undefined || movingDates) {
      patch.totalPaise = totalPaise(ratePaise, checkIn, checkOut);
    }

    if (Object.keys(patch).length === 1) throw ReservationErrors.nothingToUpdate();

    const row = await this.db.transaction(async (tx) => {
      const handle = tx as unknown as Tx;
      // Moving a committed booking re-runs the same availability rules the
      // original confirm ran, EXCLUDING itself — otherwise it always clashes.
      if (movingDates && before.status === 'CONFIRMED') {
        if (before.roomId) {
          await ReservationsService.assertRoomFree(
            handle,
            propertyId,
            before.roomId,
            checkIn,
            checkOut,
            id,
          );
        }
        await ReservationsService.assertTypeCapacity(
          handle,
          propertyId,
          before.roomTypeId,
          checkIn,
          checkOut,
          id,
        );
      }
      const [updated] = await handle
        .update(reservations)
        .set(patch)
        .where(eq(reservations.id, id))
        .returning();
      await ReservationsService.recordEvent(handle, id, 'updated', actorStaffId, {
        fields: Object.keys(patch).filter((k) => k !== 'updatedAt'),
      });
      return updated;
    });

    const [after] = await this.hydrate([row]);
    return {
      before: {
        id: before.id,
        status: before.status,
        checkIn: before.checkIn,
        checkOut: before.checkOut,
        ratePaise: before.ratePaise,
        totalPaise: before.totalPaise,
      },
      after,
    };
  }

  // ---------- Transitions ----------

  /** PENDING → CONFIRMED. The point at which the booking starts blocking. */
  /**
   * Extend an in-house (or still-committed) stay to a later check-out. Re-runs
   * the availability rules for the room/type over the fuller window (excluding
   * itself), recomputes the total, and records the change. Early departure is a
   * separate action — this only ever pushes check-out out.
   */
  async extendStay(
    propertyId: string,
    id: string,
    dto: { checkOut: string; ratePaise?: number },
    actorStaffId: string | null,
  ) {
    const before = await this.requireReservation(propertyId, id);
    if (before.status !== 'CHECKED_IN' && before.status !== 'CONFIRMED') {
      throw ReservationErrors.datesLocked();
    }
    if (dto.checkOut <= (before.checkOut as unknown as string)) {
      throw ReservationErrors.extensionMustBeLater();
    }
    assertDateOrder(before.checkIn as unknown as IsoDate, dto.checkOut as IsoDate);
    const ratePaise = dto.ratePaise ?? before.ratePaise;
    const newTotal = totalPaise(ratePaise, before.checkIn as unknown as IsoDate, dto.checkOut as IsoDate);

    const row = await this.db.transaction(async (tx) => {
      const handle = tx as unknown as Tx;
      // The extra nights must be free. Probe over the WHOLE new window minus
      // self, which is exactly the double-booking rule the confirm ran.
      if (before.roomId) {
        await ReservationsService.assertRoomFree(
          handle,
          propertyId,
          before.roomId,
          before.checkIn as unknown as IsoDate,
          dto.checkOut as IsoDate,
          id,
        );
      } else {
        await ReservationsService.assertTypeCapacity(
          handle,
          propertyId,
          before.roomTypeId,
          before.checkIn as unknown as IsoDate,
          dto.checkOut as IsoDate,
          id,
        );
      }
      const [updated] = await handle
        .update(reservations)
        .set({ checkOut: dto.checkOut, ratePaise, totalPaise: newTotal, updatedAt: new Date() })
        .where(eq(reservations.id, id))
        .returning();
      await ReservationsService.recordEvent(handle, id, 'stay_extended', actorStaffId, {
        from: before.checkOut,
        to: dto.checkOut,
        totalPaise: newTotal,
      });
      return updated;
    });
    const [after] = await this.hydrate([row]);
    return { previousCheckOut: before.checkOut, ...after };
  }

  /**
   * Move a checked-in guest to a different room. The destination must be
   * assignable and free for the remaining nights; the old room drops to DIRTY
   * (it needs a clean) and the new one goes OCCUPIED. A move to a different room
   * type re-quotes at that type's base rate unless a rate is supplied.
   */
  async moveRoom(
    propertyId: string,
    id: string,
    dto: { roomId: string; ratePaise?: number },
    actorStaffId: string | null,
    now: Date = new Date(),
  ) {
    const before = await this.requireReservation(propertyId, id);
    if (before.status !== 'CHECKED_IN') throw ReservationErrors.notInHouse();
    if (before.roomId === dto.roomId) throw ReservationErrors.sameRoom();

    const room = await this.requireRoom(propertyId, dto.roomId);
    if (!(ASSIGNABLE_ROOM_STATUSES as readonly string[]).includes(room.status)) {
      throw ReservationErrors.roomNotReady(room.number, room.status);
    }

    let ratePaise = before.ratePaise;
    if (room.roomTypeId !== before.roomTypeId) {
      const type = await this.requireRoomType(propertyId, room.roomTypeId);
      ratePaise = dto.ratePaise ?? type.baseRate;
    } else if (dto.ratePaise !== undefined) {
      ratePaise = dto.ratePaise;
    }
    const newTotal = totalPaise(
      ratePaise,
      before.checkIn as unknown as IsoDate,
      before.checkOut as unknown as IsoDate,
    );

    const row = await this.db.transaction(async (tx) => {
      const handle = tx as unknown as Tx;
      await ReservationsService.assertRoomFree(
        handle,
        propertyId,
        room.id,
        before.checkIn as unknown as IsoDate,
        before.checkOut as unknown as IsoDate,
        id,
      );
      const [updated] = await handle
        .update(reservations)
        .set({
          roomId: room.id,
          roomTypeId: room.roomTypeId,
          ratePaise,
          totalPaise: newTotal,
          updatedAt: now,
        })
        .where(eq(reservations.id, id))
        .returning();
      // The room the guest just left needs making up; the new one is occupied.
      if (before.roomId) {
        await handle
          .update(rooms)
          .set({ status: 'DIRTY' as RoomStatus, updatedAt: now })
          .where(eq(rooms.id, before.roomId));
      }
      await handle
        .update(rooms)
        .set({ status: 'OCCUPIED' as RoomStatus, updatedAt: now })
        .where(eq(rooms.id, room.id));
      await ReservationsService.recordEvent(handle, id, 'room_moved', actorStaffId, {
        fromRoomId: before.roomId,
        toRoomId: room.id,
        toRoomNumber: room.number,
      });
      return updated;
    });
    const [after] = await this.hydrate([row]);
    return { previousRoomId: before.roomId, ...after, roomNumber: room.number };
  }

  async confirm(propertyId: string, id: string, actorStaffId: string | null) {
    const before = await this.requireReservation(propertyId, id);
    assertTransition(before.status, 'CONFIRMED');

    const row = await this.db.transaction(async (tx) => {
      const handle = tx as unknown as Tx;
      if (before.roomId) {
        await ReservationsService.assertRoomFree(
          handle,
          propertyId,
          before.roomId,
          before.checkIn,
          before.checkOut,
          id,
        );
      }
      await ReservationsService.assertTypeCapacity(
        handle,
        propertyId,
        before.roomTypeId,
        before.checkIn,
        before.checkOut,
        id,
      );
      const [updated] = await handle
        .update(reservations)
        .set({ status: 'CONFIRMED', updatedAt: new Date() })
        .where(eq(reservations.id, id))
        .returning();
      await ReservationsService.recordEvent(handle, id, 'confirmed', actorStaffId);
      return updated;
    });

    const [after] = await this.hydrate([row]);
    this.notifyGuestQuietly('booking.confirmed', after);
    return { previousStatus: before.status, ...after };
  }

  /**
   * Attach a physical room. Legal before AND after confirmation, and re-runs
   * the overlap check against the NEW room either way.
   */
  async assignRoom(
    propertyId: string,
    id: string,
    dto: AssignRoomDto,
    actorStaffId: string | null,
  ) {
    const before = await this.requireReservation(propertyId, id);
    if (before.status !== 'PENDING' && before.status !== 'CONFIRMED') {
      throw ReservationErrors.invalidTransition(before.status, before.status);
    }
    const room = await this.requireRoom(propertyId, dto.roomId);
    if (room.roomTypeId !== before.roomTypeId) throw ReservationErrors.roomTypeMismatch();

    const row = await this.db.transaction(async (tx) => {
      const handle = tx as unknown as Tx;
      await ReservationsService.assertRoomFree(
        handle,
        propertyId,
        dto.roomId,
        before.checkIn,
        before.checkOut,
        id,
      );
      const [updated] = await handle
        .update(reservations)
        .set({ roomId: dto.roomId, updatedAt: new Date() })
        .where(eq(reservations.id, id))
        .returning();
      await ReservationsService.recordEvent(handle, id, 'room_assigned', actorStaffId, {
        roomId: dto.roomId,
        roomNumber: room.number,
        previousRoomId: before.roomId,
      });
      return updated;
    });

    const [after] = await this.hydrate([row]);
    return after;
  }

  /**
   * CONFIRMED → CHECKED_IN, with the room flipped to OCCUPIED in the SAME
   * transaction. A guest who is checked in but whose room still reads AVAILABLE
   * is how a hotel double-sells a room, so the two writes are never apart.
   */
  async checkIn(
    propertyId: string,
    id: string,
    dto: CheckInDto,
    actorStaffId: string | null,
    now: Date = new Date(),
  ) {
    const before = await this.requireReservation(propertyId, id);
    assertTransition(before.status, 'CHECKED_IN');

    // Today must be a night this guest actually booked. check_out is exclusive,
    // so arriving on the departure day is not a check-in.
    if (!coversDate(before, today(now))) throw ReservationErrors.notArrivalDay();

    const roomId = dto.roomId ?? before.roomId;
    if (!roomId) throw ReservationErrors.noRoomAssigned();

    const room = await this.requireRoom(propertyId, roomId);
    if (room.roomTypeId !== before.roomTypeId) throw ReservationErrors.roomTypeMismatch();
    // A room already OCCUPIED, DIRTY or off the board cannot take a guest. The
    // room this reservation was ALREADY assigned may legitimately read
    // AVAILABLE/READY/INSPECTED only — the same set either way.
    if (!(ASSIGNABLE_ROOM_STATUSES as readonly string[]).includes(room.status)) {
      throw ReservationErrors.roomNotReady(room.number, room.status);
    }

    const row = await this.db.transaction(async (tx) => {
      const handle = tx as unknown as Tx;
      await ReservationsService.assertRoomFree(
        handle,
        propertyId,
        roomId,
        before.checkIn,
        before.checkOut,
        id,
      );

      const patch: Partial<typeof reservations.$inferInsert> = {
        status: 'CHECKED_IN',
        roomId,
        checkedInAt: now,
        updatedAt: now,
      };
      if (dto.guestIdType !== undefined) patch.guestIdType = dto.guestIdType;
      if (dto.guestIdNumber !== undefined) patch.guestIdNumber = dto.guestIdNumber;

      const [updated] = await handle
        .update(reservations)
        .set(patch)
        .where(eq(reservations.id, id))
        .returning();

      await handle
        .update(rooms)
        .set({ status: 'OCCUPIED' as RoomStatus, updatedAt: now })
        .where(eq(rooms.id, roomId));

      await ReservationsService.recordEvent(handle, id, 'checked_in', actorStaffId, {
        roomId,
        roomNumber: room.number,
      });
      return updated;
    });

    const [after] = await this.hydrate([row]);
    this.notifyGuestQuietly('booking.checked_in', after);
    return { ...after, previousStatus: before.status, roomNumber: room.number };
  }

  /**
   * CHECKED_IN → CHECKED_OUT, room → DIRTY.
   *
   * DIRTY, not AVAILABLE: the room is not sellable until housekeeping has been
   * through it, and the housekeeping board (0008) is driven by exactly that
   * status. Sending it straight to AVAILABLE would sell an unmade room.
   */
  async checkOut(
    propertyId: string,
    id: string,
    dto: CheckOutDto,
    actorStaffId: string | null,
    now: Date = new Date(),
  ) {
    const before = await this.requireReservation(propertyId, id);
    assertTransition(before.status, 'CHECKED_OUT');

    // 1) Collect anything handed over at the desk FIRST, as a folio payment, so
    //    that even a checkout blocked by the gate below keeps the money on
    //    record. Idempotent by key: a tablet double-tap never charges twice.
    if (dto.collectedPaise && dto.collectedPaise > 0) {
      await this.folio.recordPayment({
        reservationId: id,
        propertyId,
        method: dto.paymentMethod ?? 'CASH',
        amountPaise: dto.collectedPaise,
        reference: dto.reference ?? null,
        collectedBy: actorStaffId,
        idempotencyKey: dto.idempotencyKey ?? null,
      });
    }

    // 2) THE GATE. The authoritative balance is room + ancillary − net paid. A
    //    guest cannot depart owing money unless a staff member explicitly
    //    overrides, and that override is recorded on the event and the audit.
    const balancePaise = await this.folio.balancePaise(id, before.totalPaise, this.db);
    const overrode = balancePaise > 0 && !!dto.allowOutstanding;
    if (balancePaise > 0 && !dto.allowOutstanding) {
      throw ReservationErrors.balanceOutstanding(balancePaise);
    }

    const row = await this.db.transaction(async (tx) => {
      const handle = tx as unknown as Tx;
      const [updated] = await handle
        .update(reservations)
        .set({ status: 'CHECKED_OUT', checkedOutAt: now, updatedAt: now })
        .where(eq(reservations.id, id))
        .returning();

      if (before.roomId) {
        await handle
          .update(rooms)
          .set({ status: 'DIRTY' as RoomStatus, updatedAt: now })
          .where(eq(rooms.id, before.roomId));
        // The one cross-module touch: the moment the room goes DIRTY, raise its
        // turnover clean so the housekeeping board is never out of step with the
        // rooms that need making up. Same transaction, and a no-op if the room
        // already has an open task. See HousekeepingService.
        await HousekeepingService.createCheckoutCleanForRoom(
          handle,
          propertyId,
          before.roomId,
          actorStaffId,
          now,
        );
      }
      await ReservationsService.recordEvent(handle, id, 'checked_out', actorStaffId, {
        roomId: before.roomId,
        collectedPaise: dto.collectedPaise ?? 0,
        balancePaise,
        outstandingOverride: overrode,
        note: dto.note ?? null,
      });
      return updated;
    });

    const [after] = await this.hydrate([row]);
    return { previousStatus: before.status, ...after, balancePaise, outstandingOverride: overrode };
  }

  /**
   * Records a payment or refund on a stay's folio, out of band from checkout —
   * an advance at booking, a mid-stay top-up, a partial settlement. Resolves the
   * reservation by (id, property) first, so one hotel can never touch another's
   * folio. Returns the payment and the refreshed balance.
   */
  async collectPayment(
    propertyId: string,
    id: string,
    input: {
      method: import('../../database/schema').FolioPaymentMethod;
      amountPaise: number;
      direction?: import('../../database/schema').FolioPaymentDirection;
      reference?: string | null;
      note?: string | null;
      idempotencyKey?: string | null;
    },
    actorStaffId: string | null,
  ) {
    const before = await this.requireReservation(propertyId, id);
    const { payment, netPaidPaise } = await this.folio.recordPayment({
      reservationId: id,
      propertyId,
      method: input.method,
      amountPaise: input.amountPaise,
      direction: input.direction,
      reference: input.reference ?? null,
      note: input.note ?? null,
      collectedBy: actorStaffId,
      idempotencyKey: input.idempotencyKey ?? null,
    });
    const balancePaise = before.totalPaise + (await this.folioAncillary(id)) - netPaidPaise;
    return { payment, netPaidPaise, balancePaise };
  }

  /** The full itemised folio for one stay — resolved by (id, property) first. */
  async folioFor(propertyId: string, id: string) {
    await this.requireReservation(propertyId, id);
    return this.folio.summary(id);
  }

  private async folioAncillary(reservationId: string): Promise<number> {
    const summary = await this.folio.summary(reservationId);
    return summary.ancillaryPaise;
  }

  /** PENDING/CONFIRMED → CANCELLED, reason recorded on the event. */
  async cancel(
    propertyId: string,
    id: string,
    dto: CancelReservationDto,
    actorStaffId: string | null,
    now: Date = new Date(),
  ) {
    const before = await this.requireReservation(propertyId, id);
    assertTransition(before.status, 'CANCELLED');

    const row = await this.db.transaction(async (tx) => {
      const handle = tx as unknown as Tx;
      const [updated] = await handle
        .update(reservations)
        .set({ status: 'CANCELLED', cancelledAt: now, updatedAt: now })
        .where(eq(reservations.id, id))
        .returning();
      await ReservationsService.recordEvent(handle, id, 'cancelled', actorStaffId, {
        reason: dto.reason,
        previousStatus: before.status,
      });
      return updated;
    });

    const [after] = await this.hydrate([row]);
    return { previousStatus: before.status, ...after };
  }

  /**
   * CONFIRMED → NO_SHOW, and only once the arrival date has actually passed.
   * Marking a future booking a no-show is always a mistake, so it is refused
   * rather than trusted.
   */
  async noShow(
    propertyId: string,
    id: string,
    actorStaffId: string | null,
    now: Date = new Date(),
  ) {
    const before = await this.requireReservation(propertyId, id);
    assertTransition(before.status, 'NO_SHOW');
    if (today(now) <= before.checkIn) throw ReservationErrors.notArrivalDay();

    const row = await this.db.transaction(async (tx) => {
      const handle = tx as unknown as Tx;
      const [updated] = await handle
        .update(reservations)
        .set({ status: 'NO_SHOW', updatedAt: now })
        .where(eq(reservations.id, id))
        .returning();
      await ReservationsService.recordEvent(handle, id, 'no_show', actorStaffId, {
        checkIn: before.checkIn,
      });
      return updated;
    });

    const [after] = await this.hydrate([row]);
    return { previousStatus: before.status, ...after };
  }
}
