import { GroupsService } from './groups.service';
import { mockDb } from '../owner-auth/testing/db.mock';

describe('GroupsService.get', () => {
  it('returns the group with its reservations and block totals', async () => {
    const db = mockDb({
      select: {
        booking_groups: [[{ id: 'g1', name: 'Menon Wedding', propertyId: 'p1' }]],
        reservations: [[
          { id: 'r1', reservationNumber: 'RSV-1', guestName: 'A', checkIn: '2026-03-14', checkOut: '2026-03-16', status: 'CONFIRMED', totalPaise: 900000, paidPaise: 400000 },
          { id: 'r2', reservationNumber: 'RSV-2', guestName: 'B', checkIn: '2026-03-14', checkOut: '2026-03-16', status: 'CONFIRMED', totalPaise: 900000, paidPaise: 900000 },
        ]],
      },
    });
    const g = await new GroupsService(db as never).get('p1', 'g1');
    expect(g.rooms).toBe(2);
    expect(g.totalPaise).toBe(1_800_000);
    expect(g.paidPaise).toBe(1_300_000);
    expect(g.balancePaise).toBe(500_000);
  });

  it('404s for a group at another property', async () => {
    const db = mockDb({ select: { booking_groups: [[]] } });
    await expect(new GroupsService(db as never).get('p1', 'g1')).rejects.toMatchObject({ status: 404 });
  });
});
