import { StaffExportService } from './staff-export.service';
import { mockDb } from '../owner-auth/testing/db.mock';

describe('StaffExportService', () => {
  it('exports reservations as a CSV document with a header row', async () => {
    const db = mockDb({
      select: {
        reservations: [
          [
            {
              reservationNumber: 'RSV-1',
              guestName: 'Meera, Nair',
              guestPhone: '9895',
              checkIn: '2026-03-14',
              checkOut: '2026-03-17',
              status: 'CHECKED_OUT',
              ratePaise: 450000,
              totalPaise: 1350000,
              paidPaise: 1350000,
              source: 'WALK_IN',
            },
          ],
        ],
      },
    });
    const csv = await new StaffExportService(db as never).document('prop-1', 'reservations');
    expect(csv.split('\r\n')[0]).toBe(
      'reservationNumber,guestName,guestPhone,checkIn,checkOut,status,ratePaise,totalPaise,paidPaise,source',
    );
    // A value with a comma is quoted per RFC 4180.
    expect(csv).toContain('"Meera, Nair"');
  });

  it('rejects an unknown entity', () => {
    expect(() => StaffExportService.assertEntity('owners')).toThrow(/Unknown export/);
  });
});
