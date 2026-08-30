import { GuestsService } from './guests.service';
import { mockDb } from '../owner-auth/testing/db.mock';

describe('GuestsService.search', () => {
  it('groups reservations by phone and overlays the blacklist flag', async () => {
    const db = mockDb({
      select: {
        reservations: [
          [
            {
              phone: '9895000000',
              name: 'Meera',
              stays: 3,
              lastStay: '2026-08-20',
              totalSpentPaise: 900000,
            },
            {
              phone: '9895111111',
              name: 'Asha',
              stays: 1,
              lastStay: '2026-07-01',
              totalSpentPaise: 300000,
            },
          ],
        ],
        guest_profiles: [[{ phone: '9895111111', blacklisted: true }]],
      },
    });
    const svc = new GuestsService(db as never);
    const out = await svc.search('prop-1');
    expect(out).toHaveLength(2);
    expect(out.find((g) => g.phone === '9895000000')).toMatchObject({
      name: 'Meera',
      stays: 3,
      blacklisted: false,
    });
    expect(out.find((g) => g.phone === '9895111111')?.blacklisted).toBe(true);
  });
});

describe('GuestsService.profile', () => {
  it('returns the overlay plus the full stay history', async () => {
    const db = mockDb({
      select: {
        guest_profiles: [
          [
            {
              name: 'Meera',
              blacklisted: false,
              notes: 'VIP',
              blacklistReason: null,
              idType: null,
              idNumber: null,
            },
          ],
        ],
        reservations: [
          [
            {
              id: 'r2',
              reservationNumber: 'RSV-2',
              checkIn: '2026-08-18',
              checkOut: '2026-08-20',
              status: 'CHECKED_OUT',
              totalPaise: 600000,
              paidPaise: 600000,
            },
            {
              id: 'r1',
              reservationNumber: 'RSV-1',
              checkIn: '2026-01-10',
              checkOut: '2026-01-12',
              status: 'CHECKED_OUT',
              totalPaise: 300000,
              paidPaise: 300000,
            },
          ],
        ],
      },
    });
    const svc = new GuestsService(db as never);
    const p = await svc.profile('prop-1', '9895000000');
    expect(p.notes).toBe('VIP');
    expect(p.stays).toBe(2);
    expect(p.history[0].reservationNumber).toBe('RSV-2');
  });
});
