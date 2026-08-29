import { validate } from 'class-validator';
import { plainToInstance } from 'class-transformer';
import { OwnerPortalService } from './owner-portal.service';
import { UpdateStaffDto } from './dto';
import { mockAudit, mockDb, sqlText, type Row } from './testing/db.mock';

const photos = { coverUrls: async () => new Map<string, string>() };

const STAFF: Row = {
  id: 'staff-1',
  propertyId: 'prop-1',
  ownerId: 'own-1',
  role: 'GENERAL_MANAGER',
  firstName: 'Asha',
  lastName: 'Menon',
  email: 'asha@hotel.test',
  mobile: '9000000001',
  address: '4 Beach Road',
  pinCode: '682031',
  state: 'Kerala',
  district: 'Ernakulam',
  status: 'ACTIVE',
  department: 'Management',
  employeeId: 'EMP-1',
  lastLoginAt: null,
};

/**
 * Wires the query fixtures `updateStaff` needs, table by table. Anything a test
 * leaves out comes back empty, which is what the not-found paths want.
 */
function svcWith(over: {
  property?: Row[];
  staff?: Row[][];
  states?: Row[];
  districts?: Row[];
  updated?: Row;
  updateThrows?: unknown;
}) {
  const db = mockDb({
    select: {
      properties: [over.property ?? [{ id: 'prop-1' }]],
      hotel_staff: over.staff ?? [[STAFF], []],
      location_states: [over.states ?? [{ id: 'st-1', name: 'Kerala' }]],
      location_districts: [over.districts ?? [{ id: 'di-1', name: 'Ernakulam' }]],
    },
    update: { hotel_staff: [over.updated ?? { ...STAFF }] },
    updateThrows: over.updateThrows !== undefined ? { hotel_staff: over.updateThrows } : undefined,
  });
  const audit = mockAudit();
  return {
    db,
    audit,
    svc: new OwnerPortalService(db as never, photos as never, audit as never),
  };
}

describe('OwnerPortalService.updateStaff — tenant scoping', () => {
  it('404s when the property is not held by this owner, without leaking membership', async () => {
    const { svc } = svcWith({ property: [] });
    await expect(
      svc.updateStaff('own-1', 'someone-elses-prop', 'staff-1', { firstName: 'Asha' }),
    ).rejects.toMatchObject({ status: 404 });
  });

  it('404s (never 403) for a staff row that lives at a different property', async () => {
    // The owner holds the property, but no live staff row matches there.
    const { svc } = svcWith({ staff: [[]] });
    await expect(
      svc.updateStaff('own-1', 'prop-1', 'staff-at-other-hotel', { firstName: 'Asha' }),
    ).rejects.toMatchObject({ status: 404, response: { error: 'STAFF_NOT_FOUND' } });
  });

  it('scopes the staff lookup by owner, property and deleted_at', async () => {
    const { svc, db } = svcWith({});
    await svc.updateStaff('own-1', 'prop-1', 'staff-1', { firstName: 'Asha' });
    const text = db.wheresFor('hotel_staff').map(sqlText).join(' | ');
    expect(text).toContain('owner_id');
    expect(text).toContain('property_id');
    expect(text).toContain('deleted_at is null');
  });
});

describe('OwnerPortalService.updateStaff — location validation', () => {
  it('rejects a state that is not in the admin catalogue', async () => {
    const { svc } = svcWith({ states: [] });
    await expect(
      svc.updateStaff('own-1', 'prop-1', 'staff-1', { state: 'Atlantis', district: 'Ernakulam' }),
    ).rejects.toMatchObject({ response: { error: 'INVALID_LOCATION' } });
  });

  it('rejects a district that does not belong to the chosen state', async () => {
    const { svc } = svcWith({ districts: [] });
    await expect(
      svc.updateStaff('own-1', 'prop-1', 'staff-1', { state: 'Kerala', district: 'Chennai' }),
    ).rejects.toMatchObject({
      response: { error: 'INVALID_LOCATION', message: 'District does not belong to Kerala' },
    });
  });

  it('accepts a district that does belong to the state', async () => {
    const { svc, db } = svcWith({});
    await svc.updateStaff('own-1', 'prop-1', 'staff-1', {
      state: 'Kerala',
      district: 'Ernakulam',
    });
    expect(db.updates[0].values).toMatchObject({ state: 'Kerala', district: 'Ernakulam' });
  });

  it('carries the stored half forward when only one half is supplied', async () => {
    // district alone is still checked against the row's existing state.
    const { svc, db } = svcWith({});
    await svc.updateStaff('own-1', 'prop-1', 'staff-1', { district: 'Ernakulam' });
    expect(db.updates[0].values).toMatchObject({ state: 'Kerala', district: 'Ernakulam' });
  });
});

describe('OwnerPortalService.updateStaff — email collisions', () => {
  it('returns a typed conflict when another live member holds the email', async () => {
    const { svc } = svcWith({ staff: [[STAFF], [{ id: 'staff-2' }]] });
    await expect(
      svc.updateStaff('own-1', 'prop-1', 'staff-1', { email: 'taken@hotel.test' }),
    ).rejects.toMatchObject({ status: 409, response: { error: 'STAFF_EMAIL_TAKEN' } });
  });

  it('excludes the row being edited from the collision check', async () => {
    // Re-submitting the member's own email is a no-op, not a conflict.
    const { svc, db } = svcWith({});
    await svc.updateStaff('own-1', 'prop-1', 'staff-1', { email: 'ASHA@hotel.test' });
    expect(db.updates[0].values).toMatchObject({ email: 'asha@hotel.test' });
  });

  it('translates a lost race (23505) into the same typed conflict', async () => {
    const { svc } = svcWith({ updateThrows: { code: '23505' } });
    await expect(
      svc.updateStaff('own-1', 'prop-1', 'staff-1', { email: 'other@hotel.test' }),
    ).rejects.toMatchObject({ response: { error: 'STAFF_EMAIL_TAKEN' } });
  });
});

describe('OwnerPortalService.updateStaff — field handling', () => {
  it('normalises an Indian mobile written any which way', async () => {
    const { svc, db } = svcWith({});
    await svc.updateStaff('own-1', 'prop-1', 'staff-1', { mobile: '+91 98950 77492' });
    expect(db.updates[0].values).toMatchObject({ mobile: '9895077492' });
  });

  it('rejects a mobile that is not a real 10-digit Indian number', async () => {
    const { svc } = svcWith({});
    await expect(
      svc.updateStaff('own-1', 'prop-1', 'staff-1', { mobile: '1234567890' }),
    ).rejects.toMatchObject({ response: { error: 'INVALID_PHONE' } });
  });

  it('touches only the fields that were supplied', async () => {
    const { svc, db } = svcWith({});
    await svc.updateStaff('own-1', 'prop-1', 'staff-1', { department: 'Front Office' });
    expect(Object.keys(db.updates[0].values!).sort()).toEqual(['department', 'updatedAt']);
  });

  it('rejects an empty patch rather than writing a bare timestamp', async () => {
    const { svc } = svcWith({});
    await expect(svc.updateStaff('own-1', 'prop-1', 'staff-1', {})).rejects.toMatchObject({
      response: { error: 'NOTHING_TO_UPDATE' },
    });
  });

  it('audits the change with both before and after', async () => {
    const { svc, audit } = svcWith({
      updated: { ...STAFF, role: 'ASSISTANT_GENERAL_MANAGER' },
    });
    await svc.updateStaff('own-1', 'prop-1', 'staff-1', {
      role: 'ASSISTANT_GENERAL_MANAGER',
    });
    expect(audit.entries[0]).toMatchObject({
      action: 'owner.staff.updated',
      entityId: 'staff-1',
      actorId: 'own-1',
      actorRole: 'OWNER',
      before: { role: 'GENERAL_MANAGER' },
      after: { role: 'ASSISTANT_GENERAL_MANAGER' },
    });
  });
});

describe('UpdateStaffDto', () => {
  async function errorsFor(payload: Record<string, unknown>): Promise<string[]> {
    const dto = plainToInstance(UpdateStaffDto, payload);
    const errors = await validate(dto as object);
    return errors.map((e) => e.property);
  }

  it('accepts a swap between the two management roles', async () => {
    expect(await errorsFor({ role: 'GENERAL_MANAGER' })).toEqual([]);
    expect(await errorsFor({ role: 'ASSISTANT_GENERAL_MANAGER' })).toEqual([]);
  });

  it('refuses to promote a member into any other hotel role', async () => {
    // Widening the 23-role staff tuple must never widen what an owner can set.
    expect(await errorsFor({ role: 'RECEPTIONIST' })).toEqual(['role']);
    expect(await errorsFor({ role: 'CHEF' })).toEqual(['role']);
  });

  it('insists on a 6-digit PIN and a real email', async () => {
    expect(await errorsFor({ pinCode: '6820' })).toEqual(['pinCode']);
    expect(await errorsFor({ email: 'not-an-email' })).toEqual(['email']);
    expect(await errorsFor({ pinCode: '682031', email: 'a@b.co' })).toEqual([]);
  });
});
