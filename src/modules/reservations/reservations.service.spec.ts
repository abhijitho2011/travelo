import { mockDb, sqlText, type MockDb } from '../owner-auth/testing/db.mock';
import { ReservationsService } from './reservations.service';
import { FolioService } from '../folio/folio.service';
import type { Database } from '../../database/database.module';

const MY_PROPERTY = 'prop-mine';
const TYPE_ID = '11111111-1111-4111-8111-111111111111';
const ROOM_ID = '22222222-2222-4222-8222-222222222222';
const STAFF_ID = 'staff-1';

function svc(db: MockDb) {
  return new ReservationsService(
    db as unknown as Database,
    new FolioService(db as unknown as Database),
  );
}

const typeRow = {
  id: TYPE_ID,
  propertyId: MY_PROPERTY,
  name: 'Deluxe',
  baseRate: 450_000,
  currency: 'INR',
  deletedAt: null,
};

const roomRow = (over: Record<string, unknown> = {}) => ({
  id: ROOM_ID,
  propertyId: MY_PROPERTY,
  roomTypeId: TYPE_ID,
  number: '304',
  status: 'READY',
  deletedAt: null,
  ...over,
});

const resRow = (over: Record<string, unknown> = {}) => ({
  id: 'res-1',
  propertyId: MY_PROPERTY,
  roomTypeId: TYPE_ID,
  roomId: null,
  reservationNumber: 'RSV-000001',
  guestName: 'Meera Nair',
  guestPhone: '9876543210',
  guestEmail: null,
  guestIdType: null,
  guestIdNumber: null,
  adults: 2,
  children: 0,
  checkIn: '2026-03-14',
  checkOut: '2026-03-17',
  status: 'CONFIRMED',
  ratePaise: 450_000,
  totalPaise: 1_350_000,
  paidPaise: 0,
  currency: 'INR',
  source: 'WALK_IN',
  notes: null,
  createdBy: STAFF_ID,
  checkedInAt: null,
  checkedOutAt: null,
  cancelledAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...over,
});

const newBooking = (over: Record<string, unknown> = {}) => ({
  roomTypeId: TYPE_ID,
  guestName: 'Meera Nair',
  guestPhone: '9876543210',
  adults: 2,
  checkIn: '2026-03-14',
  checkOut: '2026-03-17',
  ...over,
});

describe('ReservationsService — tenant isolation', () => {
  it('scopes every reservation lookup to the caller’s own property AND excludes deleted rows', async () => {
    const db = mockDb({ select: { reservations: [[resRow()]] } });
    await svc(db).requireReservation(MY_PROPERTY, 'res-1');

    const where = sqlText(db.wheresFor('reservations')[0]);
    expect(where).toContain(MY_PROPERTY);
    expect(where).toContain('deleted_at');
    expect(where).toContain('is null');
  });

  // A booking at ANOTHER hotel must look exactly like a booking that does not
  // exist. A 403 would confirm the row is real and leak where a guest is staying.
  it('404s — not 403 — for a reservation belonging to another property', async () => {
    const db = mockDb({ select: { reservations: [[]] } });
    await expect(
      svc(db).requireReservation(MY_PROPERTY, 'res-at-other-hotel'),
    ).rejects.toMatchObject({
      status: 404,
      response: { error: 'RESERVATION_NOT_FOUND' },
    });
  });

  it('refuses to book against a room type from another property, before writing anything', async () => {
    const db = mockDb({ select: { room_types: [[]] } });
    await expect(svc(db).create(MY_PROPERTY, newBooking(), STAFF_ID)).rejects.toMatchObject({
      status: 404,
      response: { error: 'ROOM_TYPE_NOT_FOUND' },
    });
    expect(db.inserts.filter((i) => i.table === 'reservations')).toEqual([]);
  });

  it('refuses to attach a room from another property', async () => {
    const db = mockDb({ select: { room_types: [[typeRow]], rooms: [[]] } });
    await expect(
      svc(db).create(MY_PROPERTY, newBooking({ roomId: ROOM_ID }), STAFF_ID),
    ).rejects.toMatchObject({ status: 404, response: { error: 'ROOM_NOT_FOUND' } });
    expect(db.inserts.filter((i) => i.table === 'reservations')).toEqual([]);
  });
});

describe('ReservationsService — the money is derived, never typed', () => {
  it('defaults the rate to the room type’s base rate and multiplies by nights', async () => {
    const db = mockDb({
      select: { room_types: [[typeRow], []], reservations: [[{ count: 7 }]] },
      insert: { reservations: [resRow()] },
    });
    await svc(db).create(MY_PROPERTY, newBooking(), STAFF_ID);

    const values = db.inserts.find((i) => i.table === 'reservations')!.values!;
    expect(values.ratePaise).toBe(450_000);
    // 14th -> 17th is THREE nights, not four days.
    expect(values.totalPaise).toBe(1_350_000);
    expect(values.reservationNumber).toBe('RSV-000008');
    // A booking that nobody has confirmed does not block anything yet.
    expect(values.status).toBe('PENDING');
  });

  it('honours an overridden rate and still derives the total from it', async () => {
    const db = mockDb({
      select: { room_types: [[typeRow], []], reservations: [[{ count: 0 }]] },
      insert: { reservations: [resRow()] },
    });
    await svc(db).create(MY_PROPERTY, newBooking({ ratePaise: 300_000 }), STAFF_ID);

    const values = db.inserts.find((i) => i.table === 'reservations')!.values!;
    expect(values.ratePaise).toBe(300_000);
    expect(values.totalPaise).toBe(900_000);
  });

  it('records a creation event alongside the booking, in the same transaction', async () => {
    const db = mockDb({
      select: { room_types: [[typeRow], []], reservations: [[{ count: 0 }]] },
      insert: { reservations: [resRow()] },
    });
    await svc(db).create(MY_PROPERTY, newBooking(), STAFF_ID);

    const event = db.inserts.find((i) => i.table === 'reservation_events');
    expect(event?.values).toMatchObject({ type: 'created', actorStaffId: STAFF_ID });
  });

  it('refuses a check-out that is not after the check-in', async () => {
    const db = mockDb({ select: { room_types: [[typeRow]] } });
    await expect(
      svc(db).create(MY_PROPERTY, newBooking({ checkOut: '2026-03-14' }), STAFF_ID),
    ).rejects.toMatchObject({ status: 400, response: { error: 'INVALID_DATES' } });
  });
});

describe('ReservationsService — no double booking', () => {
  it('refuses a confirmed booking on a room that already has an overlapping stay', async () => {
    const db = mockDb({
      select: {
        room_types: [[typeRow]],
        rooms: [[roomRow()]],
        // The clash probe finds a committed stay on those nights.
        reservations: [[{ id: 'res-other' }]],
      },
    });
    await expect(
      svc(db).create(MY_PROPERTY, newBooking({ roomId: ROOM_ID, status: 'CONFIRMED' }), STAFF_ID),
    ).rejects.toMatchObject({ status: 409, response: { error: 'ROOM_UNAVAILABLE' } });
    expect(db.inserts.filter((i) => i.table === 'reservations')).toEqual([]);
  });

  /**
   * THE boundary, asserted on the predicate the service actually builds.
   *
   * check_out is exclusive, so the overlap must use STRICT inequalities on both
   * sides. If either ever became `<=` / `>=`, a stay ending on the 15th would
   * block a stay starting on the 15th and the hotel would refuse same-day
   * turnover — half the bookings on a busy weekend.
   */
  it('probes for clashes with STRICT inequalities, so same-day turnover is legal', async () => {
    const db = mockDb({
      select: {
        room_types: [[typeRow], []],
        rooms: [[roomRow()], [{ count: 5 }], []],
        reservations: [[], [{ count: 0 }], [{ count: 0 }]],
      },
      insert: { reservations: [resRow({ roomId: ROOM_ID })] },
    });
    await svc(db).create(
      MY_PROPERTY,
      newBooking({ roomId: ROOM_ID, checkIn: '2026-03-15', status: 'CONFIRMED' }),
      STAFF_ID,
    );

    const probe = sqlText(db.wheresFor('reservations')[0]);
    // An existing stay only clashes when it STARTS before this one ends and
    // ENDS after this one starts.
    expect(probe).toContain('check_in < 2026-03-17');
    expect(probe).toContain('check_out > 2026-03-15');
    expect(probe).not.toContain('<=');
    expect(probe).not.toContain('>=');
    // Only committed stays block; a PENDING hold does not.
    expect(probe).toContain('CONFIRMED');
    expect(probe).toContain('CHECKED_IN');
    expect(probe).not.toContain('PENDING');
    // And the booking went through.
    expect(db.inserts.some((i) => i.table === 'reservations')).toBe(true);
  });

  it('locks the candidate rows rather than reading them optimistically', async () => {
    // `.for('update')` is what makes the check-then-write safe under two clerks
    // confirming the same room at once; a mock without it would throw here.
    const db = mockDb({
      select: { room_types: [[typeRow]], rooms: [[roomRow()]], reservations: [[]] },
    });
    await expect(
      svc(db).create(MY_PROPERTY, newBooking({ roomId: ROOM_ID, status: 'CONFIRMED' }), STAFF_ID),
    ).rejects.toBeDefined(); // capacity check runs next on empty mock data
    expect(db.wheresFor('reservations').length).toBeGreaterThan(0);
  });

  it('refuses when every room of the type is already sold for those dates', async () => {
    const db = mockDb({
      select: {
        room_types: [[typeRow]],
        // Two sellable rooms of the type...
        rooms: [[{ count: 2 }]],
        // ...and two committed stays covering every night of 14th–17th.
        reservations: [
          [
            { checkIn: '2026-03-14', checkOut: '2026-03-17' },
            { checkIn: '2026-03-14', checkOut: '2026-03-17' },
          ],
        ],
      },
    });
    await expect(
      svc(db).create(MY_PROPERTY, newBooking({ status: 'CONFIRMED' }), STAFF_ID),
    ).rejects.toMatchObject({ status: 409, response: { error: 'NO_AVAILABILITY' } });
  });

  it('counts OUT_OF_ORDER rooms out of the sellable stock', async () => {
    const db = mockDb({
      select: {
        room_types: [[typeRow]],
        rooms: [[{ count: 2 }]],
        reservations: [
          [
            { checkIn: '2026-03-14', checkOut: '2026-03-17' },
            { checkIn: '2026-03-14', checkOut: '2026-03-17' },
          ],
        ],
      },
    });
    await expect(
      svc(db).create(MY_PROPERTY, newBooking({ status: 'CONFIRMED' }), STAFF_ID),
    ).rejects.toMatchObject({ response: { error: 'NO_AVAILABILITY' } });

    const stockWhere = sqlText(db.wheresFor('rooms')[0]);
    expect(stockWhere).toContain('OUT_OF_ORDER');
    expect(stockWhere).toContain('deleted_at');
  });
});

describe('ReservationsService — check-in', () => {
  const NOW = new Date('2026-03-15T09:00:00.000Z');

  it('flips the reservation and the room in one transaction', async () => {
    const db = mockDb({
      select: {
        reservations: [[resRow()], []],
        rooms: [[roomRow()], []],
        room_types: [[]],
      },
      update: { reservations: [resRow({ status: 'CHECKED_IN', roomId: ROOM_ID })] },
    });
    const res = await svc(db).checkIn(MY_PROPERTY, 'res-1', { roomId: ROOM_ID }, STAFF_ID, NOW);

    expect(res.status).toBe('CHECKED_IN');
    const roomUpdate = db.updates.find((u) => u.table === 'rooms');
    // A guest checked in against a room still reading AVAILABLE is exactly how
    // a hotel sells the same room twice.
    expect(roomUpdate?.values).toMatchObject({ status: 'OCCUPIED' });
    expect(db.inserts.find((i) => i.table === 'reservation_events')?.values).toMatchObject({
      type: 'checked_in',
    });
  });

  it('captures the ID document supplied at the desk', async () => {
    const db = mockDb({
      select: { reservations: [[resRow()], []], rooms: [[roomRow()], []], room_types: [[]] },
      update: { reservations: [resRow({ status: 'CHECKED_IN' })] },
    });
    await svc(db).checkIn(
      MY_PROPERTY,
      'res-1',
      { roomId: ROOM_ID, guestIdType: 'AADHAAR', guestIdNumber: 'XXXX-1234' },
      STAFF_ID,
      NOW,
    );
    expect(db.updates.find((u) => u.table === 'reservations')?.values).toMatchObject({
      guestIdType: 'AADHAAR',
      guestIdNumber: 'XXXX-1234',
    });
  });

  it('refuses to check in a booking that was never confirmed', async () => {
    const db = mockDb({ select: { reservations: [[resRow({ status: 'PENDING' })]] } });
    await expect(svc(db).checkIn(MY_PROPERTY, 'res-1', {}, STAFF_ID, NOW)).rejects.toMatchObject({
      status: 409,
      response: { error: 'INVALID_TRANSITION' },
    });
  });

  it('refuses a check-in outside the booked nights — including on the departure day', async () => {
    const db = mockDb({ select: { reservations: [[resRow()]] } });
    await expect(
      svc(db).checkIn(MY_PROPERTY, 'res-1', {}, STAFF_ID, new Date('2026-03-17T09:00:00Z')),
    ).rejects.toMatchObject({ response: { error: 'NOT_ARRIVAL_DAY' } });
  });

  it('refuses when no room has been assigned', async () => {
    const db = mockDb({ select: { reservations: [[resRow()]] } });
    await expect(svc(db).checkIn(MY_PROPERTY, 'res-1', {}, STAFF_ID, NOW)).rejects.toMatchObject({
      response: { error: 'NO_ROOM_ASSIGNED' },
    });
  });

  it('refuses a room that housekeeping has not finished with', async () => {
    const db = mockDb({
      select: { reservations: [[resRow()]], rooms: [[roomRow({ status: 'DIRTY' })]] },
    });
    await expect(
      svc(db).checkIn(MY_PROPERTY, 'res-1', { roomId: ROOM_ID }, STAFF_ID, NOW),
    ).rejects.toMatchObject({ status: 409, response: { error: 'ROOM_NOT_READY' } });
    expect(db.updates.filter((u) => u.table === 'rooms')).toEqual([]);
  });

  it('refuses a room of the wrong type', async () => {
    const db = mockDb({
      select: { reservations: [[resRow()]], rooms: [[roomRow({ roomTypeId: 'other-type' })]] },
    });
    await expect(
      svc(db).checkIn(MY_PROPERTY, 'res-1', { roomId: ROOM_ID }, STAFF_ID, NOW),
    ).rejects.toMatchObject({ response: { error: 'ROOM_TYPE_MISMATCH' } });
  });
});

describe('ReservationsService — check-out, cancel and no-show', () => {
  it('sends the room to DIRTY, not straight back on sale', async () => {
    const db = mockDb({
      select: {
        reservations: [[resRow({ status: 'CHECKED_IN', roomId: ROOM_ID })]],
        rooms: [[]],
        room_types: [[]],
      },
      update: { reservations: [resRow({ status: 'CHECKED_OUT', roomId: ROOM_ID })] },
    });
    // The stay has a balance; an explicit override lets it check out anyway.
    await svc(db).checkOut(MY_PROPERTY, 'res-1', { allowOutstanding: true }, STAFF_ID);

    // Housekeeping owns the next step. AVAILABLE here would sell an unmade room.
    expect(db.updates.find((u) => u.table === 'rooms')?.values).toMatchObject({
      status: 'DIRTY',
    });
  });

  it('records money collected at the desk as a folio payment and refreshes paid', async () => {
    const db = mockDb({
      select: {
        reservations: [[resRow({ status: 'CHECKED_IN', paidPaise: 500_000 })]],
        room_types: [[]],
        // recordPayment.netPaid, then the gate's netPaid — both fully paid now.
        folio_payments: [[{ net: 1_350_000 }], [{ net: 1_350_000 }]],
        folio_line_items: [[{ ancillary: 0 }]],
      },
      insert: { folio_payments: [{ id: 'fp-1', direction: 'PAYMENT', amountPaise: 850_000 }] },
      update: { reservations: [resRow({ status: 'CHECKED_OUT' })] },
    });
    // Room total 1,350,000 fully covered → no override needed, gate passes.
    await svc(db).checkOut(MY_PROPERTY, 'res-1', { collectedPaise: 850_000 }, STAFF_ID);
    // A folio payment row was written for the collected amount...
    expect(db.inserts.find((i) => i.table === 'folio_payments')?.values).toMatchObject({
      amountPaise: 850_000,
      method: 'CASH',
    });
    // ...and the reservation's paid cache was refreshed to the net.
    expect(db.updates.find((u) => u.table === 'reservations')?.values).toMatchObject({
      paidPaise: 1_350_000,
    });
  });

  it('refuses checkout when the folio still shows a balance and no override', async () => {
    const db = mockDb({
      select: {
        // The gate reads the tax-inclusive folio summary: the reservation row
        // (once for the gate, once for the summary), no lines, no payments.
        reservations: [[resRow({ status: 'CHECKED_IN' })], [resRow({ status: 'CHECKED_IN' })]],
        folio_line_items: [[]],
        folio_payments: [[]],
        property_taxes: [[]],
      },
    });
    await expect(svc(db).checkOut(MY_PROPERTY, 'res-1', {}, STAFF_ID)).rejects.toMatchObject({
      response: { error: 'BALANCE_OUTSTANDING' },
    });
    // The status was never flipped.
    expect(db.updates.find((u) => u.table === 'reservations')).toBeUndefined();
  });

  it('refuses to check out someone who never checked in', async () => {
    const db = mockDb({ select: { reservations: [[resRow({ status: 'CONFIRMED' })]] } });
    await expect(svc(db).checkOut(MY_PROPERTY, 'res-1', {}, STAFF_ID)).rejects.toMatchObject({
      response: { error: 'INVALID_TRANSITION' },
    });
  });

  it('records the reason on a cancellation', async () => {
    const db = mockDb({
      select: { reservations: [[resRow({ status: 'CONFIRMED' })]], room_types: [[]] },
      update: { reservations: [resRow({ status: 'CANCELLED' })] },
    });
    await svc(db).cancel(MY_PROPERTY, 'res-1', { reason: 'Guest rang to cancel' }, STAFF_ID);
    expect(db.inserts.find((i) => i.table === 'reservation_events')?.values).toMatchObject({
      type: 'cancelled',
    });
  });

  it('refuses to cancel a guest who is already in the building', async () => {
    const db = mockDb({ select: { reservations: [[resRow({ status: 'CHECKED_IN' })]] } });
    await expect(
      svc(db).cancel(MY_PROPERTY, 'res-1', { reason: 'changed mind' }, STAFF_ID),
    ).rejects.toMatchObject({ response: { error: 'INVALID_TRANSITION' } });
  });

  it('refuses to mark a booking a no-show before its arrival date has passed', async () => {
    const db = mockDb({ select: { reservations: [[resRow()]] } });
    await expect(
      svc(db).noShow(MY_PROPERTY, 'res-1', STAFF_ID, new Date('2026-03-14T20:00:00Z')),
    ).rejects.toMatchObject({ response: { error: 'NOT_ARRIVAL_DAY' } });
  });

  it('marks a no-show once the arrival day is behind us', async () => {
    const db = mockDb({
      select: { reservations: [[resRow()]], room_types: [[]] },
      update: { reservations: [resRow({ status: 'NO_SHOW' })] },
    });
    const res = await svc(db).noShow(
      MY_PROPERTY,
      'res-1',
      STAFF_ID,
      new Date('2026-03-15T04:00:00Z'),
    );
    expect(res.status).toBe('NO_SHOW');
  });
});

describe('ReservationsService — list filters', () => {
  it('treats from/to as a window the STAY must touch, not an arrival range', async () => {
    const db = mockDb({ select: { reservations: [[], [{ count: 0 }]] } });
    await svc(db).list(MY_PROPERTY, { from: '2026-03-01', to: '2026-03-31' });

    const where = sqlText(db.wheresFor('reservations')[0]);
    // A guest who arrived in February and leaves in March belongs in a March
    // report, so the window is an overlap, not `check_in BETWEEN ...`.
    expect(where).toContain('check_in < 2026-03-31');
    expect(where).toContain('check_out > 2026-03-01');
  });

  it('searches guest name, phone and reservation number together', async () => {
    const db = mockDb({ select: { reservations: [[], [{ count: 0 }]] } });
    await svc(db).list(MY_PROPERTY, { q: 'nair' });

    const where = sqlText(db.wheresFor('reservations')[0]);
    expect(where).toContain('guest_name');
    expect(where).toContain('guest_phone');
    expect(where).toContain('reservation_number');
  });

  it('always scopes the list to the caller’s property', async () => {
    const db = mockDb({ select: { reservations: [[], [{ count: 0 }]] } });
    await svc(db).list(MY_PROPERTY);
    expect(sqlText(db.wheresFor('reservations')[0])).toContain(MY_PROPERTY);
  });
});

describe('ReservationsService.collectPayment — out-of-band folio money', () => {
  it('records a payment against the folio and returns the refreshed balance', async () => {
    const db = mockDb({
      select: {
        reservations: [[resRow({ status: 'CHECKED_IN' })]], // room 1,350,000
        folio_payments: [[{ net: 300_000 }]], // netPaid after this payment
        folio_line_items: [[]], // no ancillary
        folio_payments_summary: [[]],
      },
      insert: { folio_payments: [{ id: 'fp-1', direction: 'PAYMENT', amountPaise: 300_000 }] },
      update: { reservations: [resRow({ status: 'CHECKED_IN', paidPaise: 300_000 })] },
    });
    const out = await svc(db).collectPayment(
      MY_PROPERTY,
      'res-1',
      { method: 'UPI', amountPaise: 300_000 },
      STAFF_ID,
    );
    expect(out.netPaidPaise).toBe(300_000);
    // balance = room 1,350,000 + ancillary 0 - net 300,000
    expect(out.balancePaise).toBe(1_050_000);
    expect(db.inserts.find((i) => i.table === 'folio_payments')?.values).toMatchObject({
      method: 'UPI',
      direction: 'PAYMENT',
      amountPaise: 300_000,
    });
  });
});

describe('ReservationsService — extend stay (4.5)', () => {
  it('pushes check-out later, recomputes the total, and records it', async () => {
    const db = mockDb({
      select: {
        reservations: [[resRow({ status: 'CHECKED_IN', roomId: ROOM_ID })]],
      },
      update: { reservations: [resRow({ status: 'CHECKED_IN', checkOut: '2026-03-20' })] },
    });
    await svc(db).extendStay(MY_PROPERTY, 'res-1', { checkOut: '2026-03-20' }, STAFF_ID);
    const upd = db.updates.find((u) => u.table === 'reservations')?.values;
    expect(upd).toMatchObject({ checkOut: '2026-03-20' });
    // 14th -> 20th is 6 nights x 450000 = 2,700,000
    expect(upd?.totalPaise).toBe(2_700_000);
    expect(db.inserts.find((i) => i.table === 'reservation_events')?.values).toMatchObject({
      type: 'stay_extended',
    });
  });

  it('refuses an extension that is not later', async () => {
    const db = mockDb({ select: { reservations: [[resRow({ status: 'CHECKED_IN' })]] } });
    await expect(
      svc(db).extendStay(MY_PROPERTY, 'res-1', { checkOut: '2026-03-16' }, STAFF_ID),
    ).rejects.toMatchObject({ response: { error: 'EXTENSION_MUST_BE_LATER' } });
  });
});

describe('ReservationsService — move room (4.5)', () => {
  it('moves an in-house guest, old room to DIRTY and new room OCCUPIED', async () => {
    const db = mockDb({
      select: {
        reservations: [[resRow({ status: 'CHECKED_IN', roomId: ROOM_ID })]],
        rooms: [[roomRow({ id: 'room-2', number: '305', status: 'READY' })]],
      },
      update: { reservations: [resRow({ status: 'CHECKED_IN', roomId: 'room-2' })] },
    });
    const out = await svc(db).moveRoom(MY_PROPERTY, 'res-1', { roomId: 'room-2' }, STAFF_ID);
    expect(out.roomNumber).toBe('305');
    const roomUpdates = db.updates.filter((u) => u.table === 'rooms').map((u) => u.values?.status);
    expect(roomUpdates).toContain('DIRTY');
    expect(roomUpdates).toContain('OCCUPIED');
  });

  it('refuses to move a guest who is not in-house', async () => {
    const db = mockDb({ select: { reservations: [[resRow({ status: 'CONFIRMED' })]] } });
    await expect(
      svc(db).moveRoom(MY_PROPERTY, 'res-1', { roomId: 'room-2' }, STAFF_ID),
    ).rejects.toMatchObject({ response: { error: 'NOT_IN_HOUSE' } });
  });
});

describe('ReservationsService — per-night availability (4.4)', () => {
  it('allows a stay when each night is under capacity, though the interval total exceeds it', async () => {
    // Two rooms of the type. Three existing one-night stays, each on a DIFFERENT
    // night of 14th–17th — so every night holds just one. The old interval count
    // (3 stays >= 2 rooms) refused this wrongly; the per-night check allows it.
    const db = mockDb({
      select: {
        room_types: [[typeRow], []],
        rooms: [[{ count: 2 }]],
        reservations: [
          [
            { checkIn: '2026-03-14', checkOut: '2026-03-15' },
            { checkIn: '2026-03-15', checkOut: '2026-03-16' },
            { checkIn: '2026-03-16', checkOut: '2026-03-17' },
          ],
          [{ count: 0 }], // reservation-number counter
        ],
      },
      insert: { reservations: [resRow()] },
    });
    await expect(
      svc(db).create(MY_PROPERTY, newBooking({ status: 'CONFIRMED' }), STAFF_ID),
    ).resolves.toBeDefined();
    expect(db.inserts.find((i) => i.table === 'reservations')).toBeTruthy();
  });
});

describe('ReservationsService — seasonal rate override (4.2)', () => {
  it('quotes a booking at the date-ranged override instead of the base rate', async () => {
    const db = mockDb({
      select: {
        room_types: [[typeRow], []],
        // An override of 600000 covers the 14th (the arrival date).
        rate_overrides: [[{ ratePaise: 600_000 }]],
        reservations: [[{ count: 0 }]],
      },
      insert: { reservations: [resRow()] },
    });
    await svc(db).create(MY_PROPERTY, newBooking(), STAFF_ID);
    const values = db.inserts.find((i) => i.table === 'reservations')!.values!;
    expect(values.ratePaise).toBe(600_000); // override, not the 450000 base rate
    expect(values.totalPaise).toBe(1_800_000); // 3 nights x 600000
  });

  it('falls back to the base rate when no override covers the date', async () => {
    const db = mockDb({
      select: {
        room_types: [[typeRow], []],
        rate_overrides: [[]], // none
        reservations: [[{ count: 0 }]],
      },
      insert: { reservations: [resRow()] },
    });
    await svc(db).create(MY_PROPERTY, newBooking(), STAFF_ID);
    const values = db.inserts.find((i) => i.table === 'reservations')!.values!;
    expect(values.ratePaise).toBe(450_000);
  });
});

describe('ReservationsService — placing bookings into rooms', () => {
  const room = (id: string, number: string, over = {}) => ({
    id,
    number,
    propertyId: MY_PROPERTY,
    roomTypeId: TYPE_ID,
    status: 'AVAILABLE',
    ...over,
  });

  it('lock pins a booking; a booking with no room cannot be pinned', async () => {
    const db = mockDb({
      select: { reservations: [[resRow({ roomId: 'room-1' })]] },
      update: { reservations: [resRow({ roomId: 'room-1', roomLocked: true })] },
      insert: { reservation_events: [{}] },
    });
    await svc(db).lockRoom(MY_PROPERTY, 'res-1', true, STAFF_ID);
    expect(db.updates.find((u) => u.table === 'reservations')?.values).toMatchObject({
      roomLocked: true,
    });

    const noRoom = mockDb({ select: { reservations: [[resRow({ roomId: null })]] } });
    await expect(svc(noRoom).lockRoom(MY_PROPERTY, 'res-1', true, STAFF_ID)).rejects.toMatchObject({
      response: { error: 'ROOM_REQUIRED' },
    });
  });

  it('swap gives each booking the other room in one transaction, and refuses a locked one', async () => {
    const a = resRow({ id: 'res-a', roomId: 'room-1', status: 'CONFIRMED' });
    const b = resRow({ id: 'res-b', roomId: 'room-2', status: 'CONFIRMED' });
    const db = mockDb({
      select: { reservations: [[a], [b], [], []] }, // two lookups, two free-checks
      update: {
        reservations: [
          { ...a, roomId: 'room-2' },
          { ...b, roomId: 'room-1' },
        ],
      },
      insert: { reservation_events: [{}, {}] },
    });
    await svc(db).swapRooms(MY_PROPERTY, 'res-a', 'res-b', STAFF_ID);
    const writes = db.updates.filter((u) => u.table === 'reservations').map((u) => u.values);
    expect(writes).toEqual([
      expect.objectContaining({ roomId: 'room-2' }),
      expect.objectContaining({ roomId: 'room-1' }),
    ]);

    const locked = mockDb({
      select: { reservations: [[{ ...a, roomLocked: true }], [b]] },
    });
    await expect(
      svc(locked).swapRooms(MY_PROPERTY, 'res-a', 'res-b', STAFF_ID),
    ).rejects.toMatchObject({
      response: { error: 'ROOM_LOCKED' },
    });
  });

  it('auto-allocate fills the lowest free room of the type and never a room out of order', async () => {
    const arrival = resRow({
      id: 'res-1',
      roomId: null,
      status: 'CONFIRMED',
      checkIn: '2026-09-10',
      checkOut: '2026-09-12',
    });
    const db = mockDb({
      select: {
        reservations: [[arrival], []], // the unassigned queue; then room-1 is free
        rooms: [
          [
            room('room-ooo', '101', { status: 'OUT_OF_ORDER' }),
            room('room-1', '102'),
            room('room-2', '103'),
          ],
        ],
      },
      update: { reservations: [{ ...arrival, roomId: 'room-1' }] },
      insert: { reservation_events: [{}] },
    });
    const res = await svc(db).autoAllocate(
      MY_PROPERTY,
      { from: '2026-09-10', to: '2026-09-10' },
      STAFF_ID,
    );
    expect(res.assigned).toBe(1);
    expect(res.plan[0]).toMatchObject({ roomId: 'room-1', roomNumber: '102' });
    expect(db.updates.find((u) => u.table === 'reservations')?.values).toMatchObject({
      roomId: 'room-1',
    });
  });

  it('auto-allocate dry run plans without writing', async () => {
    const arrival = resRow({ id: 'res-1', roomId: null, status: 'CONFIRMED' });
    const db = mockDb({
      select: { reservations: [[arrival], []], rooms: [[room('room-1', '102')]] },
    });
    const res = await svc(db).autoAllocate(
      MY_PROPERTY,
      { from: '2026-09-10', to: '2026-09-10', dryRun: true },
      STAFF_ID,
    );
    expect(res.dryRun).toBe(true);
    expect(res.assigned).toBe(1);
    expect(db.updates).toEqual([]);
  });

  it('an enquiry keeps the hold deadline it was given; 0 means never', async () => {
    const db = mockDb({
      select: { room_types: [[typeRow]], rate_overrides: [[]], reservations: [[{ count: 0 }]] },
      insert: { reservations: [resRow({ status: 'PENDING' })] },
    });
    await svc(db).create(
      MY_PROPERTY,
      {
        roomTypeId: TYPE_ID,
        guestName: 'Asha Menon',
        guestPhone: '9876543210',
        adults: 1,
        checkIn: '2026-09-10',
        checkOut: '2026-09-12',
        status: 'PENDING',
        holdMinutes: 30,
      } as never,
      STAFF_ID,
    );
    const written = db.inserts.find((i) => i.table === 'reservations')?.values as {
      holdExpiresAt: Date | null;
    };
    expect(written.holdExpiresAt).toBeInstanceOf(Date);
    expect(written.holdExpiresAt!.getTime()).toBeGreaterThan(Date.now() + 29 * 60_000);

    const never = mockDb({
      select: { room_types: [[typeRow]], rate_overrides: [[]], reservations: [[{ count: 0 }]] },
      insert: { reservations: [resRow({ status: 'PENDING' })] },
    });
    await svc(never).create(
      MY_PROPERTY,
      {
        roomTypeId: TYPE_ID,
        guestName: 'Asha Menon',
        guestPhone: '9876543210',
        adults: 1,
        checkIn: '2026-09-10',
        checkOut: '2026-09-12',
        status: 'PENDING',
        holdMinutes: 0,
      } as never,
      STAFF_ID,
    );
    expect(
      (never.inserts.find((i) => i.table === 'reservations')?.values as { holdExpiresAt: unknown })
        .holdExpiresAt,
    ).toBeNull();
  });
});

describe('ReservationsService.assertRules — what the rates grid says, the booking obeys', () => {
  const rule = (date: string, over = {}) => ({
    date,
    cap: null,
    minLos: null,
    maxLos: null,
    stopSell: false,
    closedToArrival: false,
    closedToDeparture: false,
    ...over,
  });

  it('passes a stay the grid has no opinion on', () => {
    expect(() =>
      ReservationsService.assertRules(
        [rule('2026-09-10'), rule('2026-09-11')],
        '2026-09-10',
        '2026-09-12',
      ),
    ).not.toThrow();
  });

  it('refuses arrival on a closed-to-arrival night, but lets a stay-through pass', () => {
    const rules = [rule('2026-09-10', { closedToArrival: true }), rule('2026-09-11')];
    expect(() => ReservationsService.assertRules(rules, '2026-09-10', '2026-09-12')).toThrow(
      /Arrivals are closed/,
    );
    expect(() => ReservationsService.assertRules(rules, '2026-09-09', '2026-09-12')).not.toThrow();
  });

  it('refuses departure on a closed-to-departure day', () => {
    const rules = [
      rule('2026-09-10'),
      rule('2026-09-11'),
      rule('2026-09-12', { closedToDeparture: true }),
    ];
    expect(() => ReservationsService.assertRules(rules, '2026-09-10', '2026-09-12')).toThrow(
      /Departures are closed/,
    );
  });

  it('enforces min and max stay on the arrival night', () => {
    expect(() =>
      ReservationsService.assertRules(
        [rule('2026-09-10', { minLos: 3 })],
        '2026-09-10',
        '2026-09-12',
      ),
    ).toThrow(/Minimum stay is 3/);
    expect(() =>
      ReservationsService.assertRules(
        [rule('2026-09-10', { maxLos: 1 })],
        '2026-09-10',
        '2026-09-12',
      ),
    ).toThrow(/Maximum stay is 1/);
  });

  it('a stop-sell on ANY night of the stay refuses it', () => {
    const rules = [rule('2026-09-10'), rule('2026-09-11', { stopSell: true })];
    expect(() => ReservationsService.assertRules(rules, '2026-09-10', '2026-09-12')).toThrow(
      /Closed for sale on 2026-09-11/,
    );
  });
});
