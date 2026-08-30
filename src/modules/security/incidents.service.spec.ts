import { mockDb } from '../owner-auth/testing/db.mock';
import { IncidentsService } from './incidents.service';
import type { Database } from '../../database/database.module';

const MY = 'prop-mine';
const svc = (db: ReturnType<typeof mockDb>) => new IncidentsService(db as unknown as Database);

const incidentRow = (over: Record<string, unknown> = {}) => ({
  id: 'inc-1',
  propertyId: MY,
  summary: 'Broken window in lobby',
  severity: 'MEDIUM',
  status: 'OPEN',
  location: 'Lobby',
  reportedBy: 'guard-1',
  assignedTo: null,
  resolution: null,
  reportedAt: new Date(),
  resolvedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  ...over,
});

describe('IncidentsService', () => {
  it('404s an incident from another property', async () => {
    const db = mockDb({ select: { incidents: [[]] } });
    await expect(svc(db).require(MY, 'inc-x')).rejects.toMatchObject({
      response: { error: 'INCIDENT_NOT_FOUND' },
    });
  });

  describe('assign', () => {
    it('moves OPEN → ASSIGNED and records the assignee', async () => {
      const db = mockDb({
        select: {
          incidents: [[incidentRow({ status: 'OPEN' })]],
          hotel_staff: [[{ id: 'guard-2' }]],
        },
        update: { incidents: [incidentRow({ status: 'ASSIGNED', assignedTo: 'guard-2' })] },
      });
      const { after } = await svc(db).assign(MY, 'inc-1', { staffId: 'guard-2' });
      expect(after.status).toBe('ASSIGNED');
      const upd = db.updates.find((u) => u.table === 'incidents')?.values;
      expect(upd).toMatchObject({ status: 'ASSIGNED', assignedTo: 'guard-2' });
    });

    it('404s assigning to a staff member from another property', async () => {
      const db = mockDb({
        select: { incidents: [[incidentRow()]], hotel_staff: [[]] },
      });
      await expect(svc(db).assign(MY, 'inc-1', { staffId: 'x' })).rejects.toMatchObject({
        response: { error: 'SECURITY_STAFF_NOT_FOUND' },
      });
    });

    it('refuses to assign a resolved incident', async () => {
      const db = mockDb({
        select: {
          incidents: [[incidentRow({ status: 'RESOLVED' })]],
          hotel_staff: [[{ id: 'guard-2' }]],
        },
      });
      await expect(svc(db).assign(MY, 'inc-1', { staffId: 'guard-2' })).rejects.toMatchObject({
        response: { error: 'INVALID_INCIDENT_TRANSITION' },
      });
    });
  });

  describe('resolve', () => {
    it('resolves an OPEN incident with a resolution', async () => {
      const db = mockDb({
        select: { incidents: [[incidentRow({ status: 'OPEN' })]] },
        update: { incidents: [incidentRow({ status: 'RESOLVED', resolution: 'Fixed' })] },
      });
      const { after } = await svc(db).resolve(MY, 'inc-1', { resolution: 'Fixed' });
      expect(after.status).toBe('RESOLVED');
    });

    it('refuses to resolve an already-resolved incident', async () => {
      const db = mockDb({ select: { incidents: [[incidentRow({ status: 'RESOLVED' })]] } });
      await expect(svc(db).resolve(MY, 'inc-1', { resolution: 'x' })).rejects.toMatchObject({
        response: { error: 'INVALID_INCIDENT_TRANSITION' },
      });
    });
  });
});
