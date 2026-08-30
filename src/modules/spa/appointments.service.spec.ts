import { mockDb } from '../owner-auth/testing/db.mock';
import { SpaAppointmentsService } from './appointments.service';
import { SpaServicesService } from './services.service';
import type { Database } from '../../database/database.module';

const MY = 'prop-mine';

function svc(db: ReturnType<typeof mockDb>) {
  const services = new SpaServicesService(db as unknown as Database);
  return new SpaAppointmentsService(db as unknown as Database, services);
}

const serviceRow = (over: Record<string, unknown> = {}) => ({
  id: 'svc-1',
  propertyId: MY,
  name: 'Deep Tissue',
  description: null,
  durationMinutes: 60,
  pricePaise: 30_000,
  status: 'ACTIVE',
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
  ...over,
});

const apptRow = (over: Record<string, unknown> = {}) => ({
  id: 'appt-1',
  propertyId: MY,
  guestName: 'Asha',
  reservationId: null,
  serviceId: 'svc-1',
  staffId: null,
  startAt: new Date('2026-08-30T10:00:00Z'),
  status: 'BOOKED',
  serviceNameSnapshot: 'Deep Tissue',
  pricePaiseSnapshot: 30_000,
  notes: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  cancelledAt: null,
  completedAt: null,
  ...over,
});

describe('SpaAppointmentsService', () => {
  describe('create', () => {
    it('SNAPSHOTS the service name and price onto the appointment at booking', async () => {
      const db = mockDb({
        select: { spa_services: [[serviceRow({ pricePaise: 30_000, name: 'Deep Tissue' })]] },
        insert: { spa_appointments: [apptRow()] },
      });
      await svc(db).create(MY, {
        guestName: 'Asha',
        serviceId: 'svc-1',
        startAt: '2026-08-30T10:00:00Z',
      });
      const inserted = db.inserts.find((i) => i.table === 'spa_appointments')?.values;
      expect(inserted).toMatchObject({
        serviceNameSnapshot: 'Deep Tissue',
        pricePaiseSnapshot: 30_000,
      });
    });

    it('refuses to book an archived service', async () => {
      const db = mockDb({
        select: { spa_services: [[serviceRow({ status: 'ARCHIVED' })]] },
      });
      await expect(
        svc(db).create(MY, { guestName: 'A', serviceId: 'svc-1', startAt: '2026-08-30T10:00:00Z' }),
      ).rejects.toMatchObject({ response: { error: 'SPA_SERVICE_ARCHIVED' } });
    });

    it('404s a service from another property', async () => {
      const db = mockDb({ select: { spa_services: [[]] } });
      await expect(
        svc(db).create(MY, { guestName: 'A', serviceId: 'x', startAt: '2026-08-30T10:00:00Z' }),
      ).rejects.toMatchObject({ response: { error: 'SPA_SERVICE_NOT_FOUND' } });
    });
  });

  describe('setStatus (own-only for therapists)', () => {
    it('lets a therapist advance their own appointment', async () => {
      const db = mockDb({
        select: { spa_appointments: [[apptRow({ staffId: 'me', status: 'BOOKED' })]] },
        update: { spa_appointments: [apptRow({ staffId: 'me', status: 'IN_PROGRESS' })] },
      });
      const { after } = await svc(db).setStatus(MY, 'appt-1', 'IN_PROGRESS', 'me');
      expect(after.status).toBe('IN_PROGRESS');
    });

    it('404s a therapist acting on an appointment assigned to someone else', async () => {
      const db = mockDb({
        select: { spa_appointments: [[apptRow({ staffId: 'other', status: 'BOOKED' })]] },
      });
      await expect(svc(db).setStatus(MY, 'appt-1', 'IN_PROGRESS', 'me')).rejects.toMatchObject({
        response: { error: 'SPA_APPOINTMENT_NOT_FOUND' },
      });
    });

    it('rejects an illegal transition (BOOKED → COMPLETED)', async () => {
      const db = mockDb({
        select: { spa_appointments: [[apptRow({ status: 'BOOKED' })]] },
      });
      await expect(svc(db).setStatus(MY, 'appt-1', 'COMPLETED')).rejects.toMatchObject({
        response: { error: 'INVALID_APPOINTMENT_TRANSITION' },
      });
    });
  });
});
