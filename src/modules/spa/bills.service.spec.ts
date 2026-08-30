import { mockDb } from '../owner-auth/testing/db.mock';
import { SpaBillsService } from './bills.service';
import { FolioService } from '../folio/folio.service';
import type { Database } from '../../database/database.module';
import type { ConfigService } from '@nestjs/config';

const MY = 'prop-mine';
const config = (taxPercent = 5) => ({ get: () => taxPercent }) as unknown as ConfigService;
const svc = (db: ReturnType<typeof mockDb>, tax = 5) =>
  new SpaBillsService(
    db as unknown as Database,
    config(tax),
    new FolioService(db as unknown as Database),
  );

const apptRow = (over: Record<string, unknown> = {}) => ({
  id: 'appt-1',
  propertyId: MY,
  guestName: 'Asha',
  reservationId: null,
  serviceId: 'svc-1',
  staffId: 'staff-1',
  startAt: new Date('2026-08-30T10:00:00Z'),
  status: 'COMPLETED',
  serviceNameSnapshot: 'Deep Tissue',
  pricePaiseSnapshot: 30_000,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  cancelledAt: null,
  completedAt: new Date(),
  ...over,
});

const billRow = (over: Record<string, unknown> = {}) => ({
  id: 'bill-1',
  propertyId: MY,
  appointmentId: 'appt-1',
  subtotalPaise: 30_000,
  taxPaise: 1_500,
  totalPaise: 31_500,
  status: 'UNPAID',
  paymentMethod: null,
  reservationId: null,
  settledBy: null,
  refundReason: null,
  paidAt: null,
  refundedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe('SpaBillsService', () => {
  describe('createForAppointment', () => {
    it('computes the bill from the appointment price SNAPSHOT, not the live service', async () => {
      const db = mockDb({
        select: {
          spa_appointments: [[apptRow({ pricePaiseSnapshot: 30_000 })]],
          spa_bills: [[]], // no existing bill
        },
        insert: { spa_bills: [billRow()] },
      });
      await svc(db, 5).createForAppointment(MY, 'appt-1');
      const inserted = db.inserts.find((i) => i.table === 'spa_bills')?.values;
      expect(inserted).toMatchObject({
        subtotalPaise: 30_000,
        taxPaise: 1_500,
        totalPaise: 31_500,
      });
    });

    it('refuses to bill an appointment that is not COMPLETED', async () => {
      const db = mockDb({ select: { spa_appointments: [[apptRow({ status: 'BOOKED' })]] } });
      await expect(svc(db).createForAppointment(MY, 'appt-1')).rejects.toMatchObject({
        response: { error: 'SPA_APPOINTMENT_NOT_BILLABLE' },
      });
    });

    it('404s an appointment from another property', async () => {
      const db = mockDb({ select: { spa_appointments: [[]] } });
      await expect(svc(db).createForAppointment(MY, 'appt-x')).rejects.toMatchObject({
        response: { error: 'SPA_APPOINTMENT_NOT_FOUND' },
      });
    });

    it('refuses a second bill for the same appointment', async () => {
      const db = mockDb({
        select: {
          spa_appointments: [[apptRow()]],
          spa_bills: [[{ id: 'bill-1' }]],
        },
      });
      await expect(svc(db).createForAppointment(MY, 'appt-1')).rejects.toMatchObject({
        response: { error: 'SPA_BILL_EXISTS' },
      });
    });
  });

  describe('settle', () => {
    it('settles a CASH bill and records the payment method', async () => {
      const db = mockDb({
        select: { spa_bills: [[billRow()]] },
        update: { spa_bills: [billRow({ status: 'PAID', paymentMethod: 'CASH' })] },
      });
      const { after } = await svc(db).settle(MY, 'bill-1', { method: 'CASH' }, 'cashier-1');
      expect(after.status).toBe('PAID');
      const upd = db.updates.find((u) => u.table === 'spa_bills')?.values;
      expect(upd).toMatchObject({ status: 'PAID', paymentMethod: 'CASH', settledBy: 'cashier-1' });
    });

    it('validates ROOM_CHARGE against a CHECKED_IN reservation at this property', async () => {
      const db = mockDb({
        select: {
          spa_bills: [[billRow()]],
          reservations: [[{ id: 'res-1', status: 'CHECKED_IN' }]],
          spa_appointments: [[{ name: 'Deep Tissue' }]],
          folio_line_items: [[]], // findLineBySource → none yet
        },
        update: { spa_bills: [billRow({ status: 'PAID', paymentMethod: 'ROOM_CHARGE' })] },
      });
      await svc(db).settle(MY, 'bill-1', { method: 'ROOM_CHARGE', reservationId: 'res-1' }, 's1');
      const upd = db.updates.find((u) => u.table === 'spa_bills')?.values;
      expect(upd).toMatchObject({ paymentMethod: 'ROOM_CHARGE', reservationId: 'res-1' });
      // The spa charge POSTS to the guest folio, tagged with the bill as source.
      const folioPost = db.inserts.find((i) => i.table === 'folio_line_items');
      expect(folioPost?.values).toMatchObject({
        reservationId: 'res-1',
        kind: 'SPA',
        sourceType: 'spa_bill',
        sourceId: 'bill-1',
      });
    });

    it('rejects ROOM_CHARGE when the reservation is not in-house', async () => {
      const db = mockDb({
        select: {
          spa_bills: [[billRow()]],
          reservations: [[{ id: 'res-1', status: 'CHECKED_OUT' }]],
        },
      });
      await expect(
        svc(db).settle(MY, 'bill-1', { method: 'ROOM_CHARGE', reservationId: 'res-1' }, 's1'),
      ).rejects.toMatchObject({ response: { error: 'RESERVATION_NOT_IN_HOUSE' } });
    });

    it('rejects ROOM_CHARGE with no reservation id', async () => {
      const db = mockDb({ select: { spa_bills: [[billRow()]] } });
      await expect(
        svc(db).settle(MY, 'bill-1', { method: 'ROOM_CHARGE' }, 's1'),
      ).rejects.toMatchObject({ response: { error: 'RESERVATION_REQUIRED' } });
    });

    it('refuses to settle a bill that is not UNPAID', async () => {
      const db = mockDb({ select: { spa_bills: [[billRow({ status: 'PAID' })]] } });
      await expect(svc(db).settle(MY, 'bill-1', { method: 'CASH' }, 's1')).rejects.toMatchObject({
        response: { error: 'SPA_BILL_NOT_UNPAID' },
      });
    });
  });

  describe('refund', () => {
    it('refunds a PAID bill, record-only', async () => {
      const db = mockDb({
        select: { spa_bills: [[billRow({ status: 'PAID' })]] },
        update: { spa_bills: [billRow({ status: 'REFUNDED' })] },
      });
      const { after } = await svc(db).refund(MY, 'bill-1', { reason: 'guest complaint' });
      expect(after.status).toBe('REFUNDED');
    });

    it('refuses to refund a bill that was never paid', async () => {
      const db = mockDb({ select: { spa_bills: [[billRow({ status: 'UNPAID' })]] } });
      await expect(svc(db).refund(MY, 'bill-1', { reason: 'x' })).rejects.toMatchObject({
        response: { error: 'SPA_BILL_NOT_PAID' },
      });
    });
  });
});
