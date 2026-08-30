import { mockDb, sqlText, type MockDb } from '../owner-auth/testing/db.mock';
import { DeskService } from './desk.service';
import { ReservationsService } from './reservations.service';
import { FolioService } from '../folio/folio.service';
import type { Database } from '../../database/database.module';
import type { RoomStatus } from '../../database/schema';

const MY_PROPERTY = 'prop-mine';

function svc(db: MockDb) {
  return new DeskService(
    db as unknown as Database,
    new ReservationsService(db as unknown as Database, new FolioService(db as unknown as Database)),
  );
}

describe('DeskService.occupancyPercent', () => {
  const counts = (entries: [RoomStatus, number][]) => new Map<RoomStatus, number>(entries);

  it('is occupied over everything that can actually be sold', () => {
    expect(
      DeskService.occupancyPercent(
        counts([
          ['OCCUPIED', 6],
          ['AVAILABLE', 4],
        ]),
      ),
    ).toBe(60);
  });

  /**
   * A flooded wing is not a hotel failing to fill rooms. OUT_OF_ORDER rooms
   * leave the DENOMINATOR entirely, so taking six rooms off the board raises
   * occupancy rather than tanking it.
   */
  it('takes OUT_OF_ORDER rooms out of the denominator', () => {
    expect(
      DeskService.occupancyPercent(
        counts([
          ['OCCUPIED', 6],
          ['AVAILABLE', 2],
          ['OUT_OF_ORDER', 12],
        ]),
      ),
    ).toBe(75);
  });

  // MAINTENANCE is a same-day state, not a withdrawal from inventory: a room
  // being fixed this morning is a room the hotel still expects to sell tonight.
  it('keeps MAINTENANCE rooms in the denominator', () => {
    expect(
      DeskService.occupancyPercent(
        counts([
          ['OCCUPIED', 1],
          ['MAINTENANCE', 1],
        ]),
      ),
    ).toBe(50);
  });

  it('reports 0 rather than dividing by zero for a hotel with no rooms yet', () => {
    expect(DeskService.occupancyPercent(counts([]))).toBe(0);
    expect(DeskService.occupancyPercent(counts([['OUT_OF_ORDER', 3]]))).toBe(0);
  });

  it('keeps one decimal place, so 1 room in 3 is not reported as 33%', () => {
    expect(
      DeskService.occupancyPercent(
        counts([
          ['OCCUPIED', 1],
          ['AVAILABLE', 2],
        ]),
      ),
    ).toBe(33.3);
  });
});

describe('DeskService.today', () => {
  const NOW = new Date('2026-03-15T06:00:00.000Z');

  it('answers the whole reception board in one call, scoped to the property', async () => {
    const db = mockDb({
      select: {
        reservations: [[], [], [], [{ count: 2 }]],
        rooms: [
          [{ count: 9 }],
          [
            { status: 'AVAILABLE', count: 4 },
            { status: 'DIRTY', count: 3 },
            { status: 'READY', count: 2 },
            { status: 'INSPECTED', count: 1 },
            { status: 'OCCUPIED', count: 6 },
          ],
        ],
      },
    });
    const board = await svc(db).today(MY_PROPERTY, NOW);

    expect(board.date).toBe('2026-03-15');
    expect(board.counts).toEqual({
      arrivals: 0,
      departures: 0,
      inHouse: 0,
      availableRooms: 9,
      roomsAvailable: 4,
      roomsDirty: 3,
      // READY + INSPECTED are both sellable-clean: 2 + 1.
      roomsReady: 3,
      walkInsToday: 2,
      pendingPaymentPaise: 0,
      pendingFolios: 0,
    });
    for (const where of db.wheresFor('reservations')) {
      expect(sqlText(where)).toContain(MY_PROPERTY);
    }
  });

  it('counts only walk-ins created today and not cancelled', async () => {
    const db = mockDb({
      select: { reservations: [[], [], [], [{ count: 0 }]], rooms: [[{ count: 0 }], []] },
    });
    await svc(db).today(MY_PROPERTY, NOW);

    const walkInWhere = sqlText(db.wheresFor('reservations')[3]);
    expect(walkInWhere).toContain('WALK_IN');
    expect(walkInWhere).toContain('CANCELLED');
    expect(walkInWhere).toContain('created_at');
  });

  /**
   * The pending-payment figures come from the SAME rows the board renders —
   * departures and in-house — so the tile and the list can never disagree.
   * Fully-settled (and over-paid) folios contribute nothing.
   */
  it('sums outstanding balances over departures and in-house rows only', async () => {
    const dep = {
      id: 'r-dep',
      roomTypeId: 'rt-1',
      roomId: null,
      checkIn: '2026-03-14',
      checkOut: '2026-03-15',
      totalPaise: 500_00,
      paidPaise: 200_00,
    };
    const stayerOwing = { ...dep, id: 'r-in-1', checkOut: '2026-03-17', paidPaise: 0 };
    const stayerPaid = { ...dep, id: 'r-in-2', checkOut: '2026-03-17', paidPaise: 700_00 };
    const db = mockDb({
      select: {
        reservations: [[], [dep], [stayerOwing, stayerPaid], [{ count: 0 }]],
        rooms: [[{ count: 0 }], []],
        room_types: [[{ id: 'rt-1', name: 'Deluxe' }], [{ id: 'rt-1', name: 'Deluxe' }]],
      },
    });
    const board = await svc(db).today(MY_PROPERTY, NOW);

    // 300 due on the departure + 500 due in-house; the over-paid folio adds 0.
    expect(board.counts.pendingPaymentPaise).toBe(800_00);
    expect(board.counts.pendingFolios).toBe(2);
  });

  /**
   * In-house means "sleeping here tonight". check_out is exclusive, so a guest
   * leaving this morning is a DEPARTURE and not in-house — counting them in
   * both would overstate occupancy every single day.
   */
  it('excludes today’s departures from the in-house list', async () => {
    const db = mockDb({ select: { reservations: [[], [], []], rooms: [[{ count: 0 }]] } });
    await svc(db).today(MY_PROPERTY, NOW);

    const inHouseWhere = sqlText(db.wheresFor('reservations')[2]);
    expect(inHouseWhere).toContain('check_out > 2026-03-15');
    expect(inHouseWhere).toContain('check_in <= 2026-03-15');
  });
});

describe('DeskService.availability', () => {
  it('reports free rooms per type using the same rule the booking path enforces', async () => {
    const db = mockDb({
      select: {
        room_types: [
          [
            {
              id: 'rt-1',
              name: 'Deluxe',
              bedType: 'QUEEN',
              maxOccupancy: 2,
              baseRate: 450_000,
              currency: 'INR',
            },
          ],
        ],
        rooms: [[{ roomTypeId: 'rt-1', count: 5 }]],
        reservations: [[{ roomTypeId: 'rt-1', count: 3 }]],
      },
    });
    const res = await svc(db).availability(MY_PROPERTY, {
      checkIn: '2026-03-14',
      checkOut: '2026-03-17',
    });

    expect(res.items).toEqual([
      expect.objectContaining({
        roomTypeId: 'rt-1',
        totalRooms: 5,
        bookedRooms: 3,
        availableRooms: 2,
      }),
    ]);
  });

  it('never reports a negative number of free rooms', async () => {
    const db = mockDb({
      select: {
        room_types: [[{ id: 'rt-1', name: 'Deluxe', baseRate: 0, currency: 'INR' }]],
        rooms: [[{ roomTypeId: 'rt-1', count: 2 }]],
        reservations: [[{ roomTypeId: 'rt-1', count: 4 }]],
      },
    });
    const res = await svc(db).availability(MY_PROPERTY, {
      checkIn: '2026-03-14',
      checkOut: '2026-03-17',
    });
    expect(res.items[0].availableRooms).toBe(0);
  });

  it('refuses a range whose check-out is not after its check-in', async () => {
    const db = mockDb({});
    await expect(
      svc(db).availability(MY_PROPERTY, { checkIn: '2026-03-14', checkOut: '2026-03-14' }),
    ).rejects.toMatchObject({ response: { error: 'INVALID_DATES' } });
  });
});
