import { ReportsService } from './reports.service';
import { mockDb } from '../owner-auth/testing/db.mock';

describe('ReportsService', () => {
  it('computes ADR and RevPAR per day and sorts ascending', async () => {
    const db = mockDb({
      select: {
        property_daily_snapshots: [
          [
            {
              businessDate: '2026-08-29',
              occupancyPct: 50,
              roomsSold: 5,
              roomsAvailable: 10,
              arrivals: 2,
              departures: 1,
              noShows: 0,
              revenuePaise: 500000,
            },
            {
              businessDate: '2026-08-28',
              occupancyPct: 80,
              roomsSold: 8,
              roomsAvailable: 10,
              arrivals: 3,
              departures: 0,
              noShows: 1,
              revenuePaise: 960000,
            },
          ],
        ],
      },
    });
    const svc = new ReportsService(db as never);
    const rows = await svc.occupancyHistory('prop-1', 30);
    expect(rows.map((r) => r.date)).toEqual(['2026-08-28', '2026-08-29']); // sorted asc
    // ADR = revenue / rooms sold; 500000/5 = 100000
    expect(rows[1].adrPaise).toBe(100000);
    // RevPAR = revenue / rooms available; 500000/10 = 50000
    expect(rows[1].revparPaise).toBe(50000);
  });

  it('summary aggregates ADR/RevPAR/occupancy over the window', async () => {
    const db = mockDb({
      select: {
        property_daily_snapshots: [
          [
            {
              businessDate: '2026-08-29',
              occupancyPct: 50,
              roomsSold: 5,
              roomsAvailable: 10,
              arrivals: 0,
              departures: 0,
              noShows: 0,
              revenuePaise: 500000,
            },
            {
              businessDate: '2026-08-28',
              occupancyPct: 100,
              roomsSold: 10,
              roomsAvailable: 10,
              arrivals: 0,
              departures: 0,
              noShows: 0,
              revenuePaise: 1500000,
            },
          ],
        ],
      },
    });
    const svc = new ReportsService(db as never);
    const s = await svc.summary('prop-1', 30);
    // revenue 2,000,000; sold 15; avail 20
    expect(s.adrPaise).toBe(Math.round(2000000 / 15));
    expect(s.revparPaise).toBe(Math.round(2000000 / 20));
    expect(s.avgOccupancyPct).toBe(Math.round((15 / 20) * 100));
  });
});
