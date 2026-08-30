import { mockDb } from '../owner-auth/testing/db.mock';
import { SecurityLogsService } from './logs.service';
import type { Database } from '../../database/database.module';

const MY = 'prop-mine';
const svc = (db: ReturnType<typeof mockDb>) => new SecurityLogsService(db as unknown as Database);

const gateRow = (over: Record<string, unknown> = {}) => ({
  id: 'g-1',
  propertyId: MY,
  movement: 'VEHICLE_IN',
  subject: 'KA01AB1234',
  detail: null,
  recordedBy: 'guard-1',
  createdAt: new Date(),
  ...over,
});

const visitorRow = (over: Record<string, unknown> = {}) => ({
  id: 'v-1',
  propertyId: MY,
  name: 'Ravi',
  visiting: 'Room 204',
  purpose: 'Delivery',
  passNumber: 'P-1',
  recordedBy: 'guard-1',
  arrivedAt: new Date(),
  departedAt: null,
  createdAt: new Date(),
  ...over,
});

describe('SecurityLogsService', () => {
  describe('gateLog', () => {
    it('filters the feed to vehicle movements when kind=vehicle', async () => {
      const db = mockDb({
        select: {
          gate_movements: [
            [gateRow({ movement: 'VEHICLE_IN' }), gateRow({ id: 'g-2', movement: 'STAFF_IN' })],
          ],
        },
      });
      const res = await svc(db).gateLog(MY, 'vehicle');
      expect(res.items).toHaveLength(1);
      expect(res.items[0].movement).toBe('VEHICLE_IN');
    });

    it('returns the whole feed with no kind', async () => {
      const db = mockDb({
        select: {
          gate_movements: [
            [gateRow({ movement: 'VEHICLE_IN' }), gateRow({ id: 'g-2', movement: 'STAFF_IN' })],
          ],
        },
      });
      const res = await svc(db).gateLog(MY);
      expect(res.items).toHaveLength(2);
    });
  });

  describe('departVisitor', () => {
    it('stamps departedAt on an on-site visitor', async () => {
      const db = mockDb({
        select: { visitor_logs: [[visitorRow({ departedAt: null })]] },
        update: { visitor_logs: [visitorRow({ departedAt: new Date() })] },
      });
      const res = await svc(db).departVisitor(MY, 'v-1');
      expect(res.onSite).toBe(false);
    });

    it('refuses to check out a visitor who already departed', async () => {
      const db = mockDb({
        select: { visitor_logs: [[visitorRow({ departedAt: new Date() })]] },
      });
      await expect(svc(db).departVisitor(MY, 'v-1')).rejects.toMatchObject({
        response: { error: 'VISITOR_ALREADY_DEPARTED' },
      });
    });

    it('404s a visitor from another property', async () => {
      const db = mockDb({ select: { visitor_logs: [[]] } });
      await expect(svc(db).departVisitor(MY, 'v-x')).rejects.toMatchObject({
        response: { error: 'VISITOR_NOT_FOUND' },
      });
    });
  });
});
