import { mockDb, sqlText, type MockDb } from '../owner-auth/testing/db.mock';
import { DeskService } from './desk.service';
import { ReservationsService } from './reservations.service';
import type { Database } from '../../database/database.module';
import type { RoomStatus } from '../../database/schema';

const MY_PROPERTY = 'prop-mine';

function svc(db: MockDb) {
  return new DeskService(
    db as unknown as Database,
    new ReservationsService(db as unknown as Database),
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
      select: { reservations: [[], [], []], rooms: [[{ count: 9 }]] },
    });
    const board = await svc(db).today(MY_PROPERTY, NOW);

    expect(board.date).toBe('2026-03-15');
    expect(board.counts).toEqual({
      arrivals: 0,
      departures: 0,
      inHouse: 0,
      availableRooms: 9,
    });
    for (const where of db.wheresFor('reservations')) {
      expect(sqlText(where)).toContain(MY_PROPERTY);
    }
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
