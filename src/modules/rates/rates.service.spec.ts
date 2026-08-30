import { RatesService } from './rates.service';
import { mockDb } from '../owner-auth/testing/db.mock';

describe('RatesService', () => {
  it('refuses an override whose end is before its start', async () => {
    const db = mockDb({});
    await expect(
      new RatesService(db as never).create('p1', {
        roomTypeId: 't1',
        startDate: '2026-12-31',
        endDate: '2026-12-01',
        ratePaise: 900000,
      }),
    ).rejects.toThrow(/endDate/);
  });

  it('404s when the room type is not at this property', async () => {
    const db = mockDb({ select: { room_types: [[]] } });
    await expect(
      new RatesService(db as never).create('p1', {
        roomTypeId: 't1',
        startDate: '2026-12-20',
        endDate: '2027-01-05',
        ratePaise: 900000,
      }),
    ).rejects.toMatchObject({ status: 404 });
  });
});
