import { OwnerProfileService } from './owner-profile.service';
import { mockAudit, mockDb, sqlText, type Row } from './testing/db.mock';

const OWNER: Row = {
  id: 'own-1',
  name: 'Ravi Nair',
  email: 'ravi@hotels.test',
  emailVerified: true,
  phone: '9895077492',
  mobile: '9895077492',
  company: 'Nair Hospitality',
  gstNumber: '29ABCDE1234F1Z5',
  address: { line1: '12 Marine Drive', pinCode: '682031', state: 'Kerala', district: 'Ernakulam' },
  status: 'ACTIVE',
  city: 'Ernakulam',
  country: 'India',
  stateId: 'st-1',
  districtId: 'di-1',
  pinCode: '682031',
  createdAt: new Date('2026-01-05T00:00:00Z'),
  deletedAt: null,
};

const OWNER_ROW = { o: OWNER, stateName: 'Kerala', districtName: 'Ernakulam' };

function svcWith(
  over: {
    owner?: Row[];
    states?: Row[];
    districts?: Row[];
    properties?: Row[];
    staff?: Row[];
  } = {},
) {
  const db = mockDb({
    select: {
      // load() runs once for the read and, on update, once again for the
      // re-read that produces the `after` snapshot.
      owners: [over.owner ?? [OWNER_ROW], over.owner ?? [OWNER_ROW]],
      location_states: [over.states ?? [{ id: 'st-2', name: 'Karnataka' }]],
      location_districts: [over.districts ?? [{ id: 'di-2', name: 'Bengaluru Urban' }]],
      properties: [over.properties ?? [{ count: 3 }], over.properties ?? [{ count: 3 }]],
      hotel_staff: [over.staff ?? [{ count: 7 }], over.staff ?? [{ count: 7 }]],
    },
  });
  const audit = mockAudit();
  return { db, audit, svc: new OwnerProfileService(db as never, audit as never) };
}

describe('OwnerProfileService.get', () => {
  it('returns the owner record with catalogue names and live counts', async () => {
    const { svc } = svcWith();
    await expect(svc.get('own-1')).resolves.toMatchObject({
      id: 'own-1',
      name: 'Ravi Nair',
      company: 'Nair Hospitality',
      email: 'ravi@hotels.test',
      emailVerified: true,
      phone: '9895077492',
      gstNumber: '29ABCDE1234F1Z5',
      address: '12 Marine Drive',
      pinCode: '682031',
      state: 'Kerala',
      district: 'Ernakulam',
      status: 'ACTIVE',
      propertiesCount: 3,
      staffCount: 7,
    });
  });

  it('counts only live properties and staff', async () => {
    const { svc, db } = svcWith();
    await svc.get('own-1');
    expect(db.wheresFor('properties').map(sqlText).join(' ')).toContain('deleted_at is null');
    expect(db.wheresFor('hotel_staff').map(sqlText).join(' ')).toContain('deleted_at is null');
  });

  it('404s for a soft-deleted owner', async () => {
    const { svc } = svcWith({ owner: [{ ...OWNER_ROW, o: { ...OWNER, deletedAt: new Date() } }] });
    await expect(svc.get('own-1')).rejects.toMatchObject({ status: 404 });
  });
});

describe('OwnerProfileService.update — email is an auth identifier', () => {
  it('rejects any attempt to change the email, with a reason', async () => {
    const { svc, db } = svcWith();
    await expect(svc.update('own-1', { email: 'new-address@hotels.test' })).rejects.toMatchObject({
      status: 400,
      response: { error: 'EMAIL_NOT_EDITABLE' },
    });
    // Nothing was written — the rejection happens before any query runs.
    expect(db.updates).toHaveLength(0);
  });

  it('rejects the email even when it is submitted alongside valid edits', async () => {
    const { svc, db } = svcWith();
    await expect(
      svc.update('own-1', { name: 'Ravi K Nair', email: 'ravi@hotels.test' }),
    ).rejects.toMatchObject({ response: { error: 'EMAIL_NOT_EDITABLE' } });
    expect(db.updates).toHaveLength(0);
  });
});

describe('OwnerProfileService.update — validation', () => {
  it('writes the fields that were supplied and leaves the rest alone', async () => {
    const { svc, db } = svcWith();
    await svc.update('own-1', { name: '  Ravi K Nair  ', company: 'Nair Group' });
    expect(db.updates[0].values).toMatchObject({ name: 'Ravi K Nair', company: 'Nair Group' });
    expect(db.updates[0].values).not.toHaveProperty('email');
    expect(db.updates[0].values).not.toHaveProperty('status');
  });

  it('normalises the phone and rejects a number that is not Indian mobile', async () => {
    const ok = svcWith();
    await ok.svc.update('own-1', { phone: '+91 98950 77492' });
    expect(ok.db.updates[0].values).toMatchObject({ phone: '9895077492', mobile: '9895077492' });

    const bad = svcWith();
    await expect(bad.svc.update('own-1', { phone: '1234567890' })).rejects.toMatchObject({
      response: { error: 'INVALID_PHONE' },
    });
  });

  it('upper-cases a valid GSTIN and stores a blank one as NULL', async () => {
    const upper = svcWith();
    await upper.svc.update('own-1', { gstNumber: '29abcde1234f1z5' });
    expect(upper.db.updates[0].values).toMatchObject({ gstNumber: '29ABCDE1234F1Z5' });

    const cleared = svcWith();
    await cleared.svc.update('own-1', { gstNumber: '   ' });
    expect(cleared.db.updates[0].values).toMatchObject({ gstNumber: null });
  });

  it('rejects a malformed GSTIN', async () => {
    const { svc } = svcWith();
    await expect(svc.update('own-1', { gstNumber: '29ABCDE1234F1X5' })).rejects.toMatchObject({
      response: { error: 'INVALID_GSTIN' },
    });
  });

  it('insists on both halves of a location change', async () => {
    const { svc } = svcWith();
    await expect(
      svc.update('own-1', { state: '11111111-1111-1111-1111-111111111111' }),
    ).rejects.toMatchObject({ response: { error: 'INVALID_LOCATION' } });
  });

  it('rejects a district that does not belong to the chosen state', async () => {
    const { svc } = svcWith({ districts: [] });
    await expect(
      svc.update('own-1', {
        state: '11111111-1111-1111-1111-111111111111',
        district: '22222222-2222-2222-2222-222222222222',
      }),
    ).rejects.toMatchObject({
      response: { error: 'INVALID_LOCATION', message: 'District does not belong to Karnataka' },
    });
  });

  it('keeps the address JSONB block in step with the flat columns', async () => {
    const { svc, db } = svcWith();
    await svc.update('own-1', {
      state: '11111111-1111-1111-1111-111111111111',
      district: '22222222-2222-2222-2222-222222222222',
      address: '9 MG Road',
      pinCode: '560001',
    });
    expect(db.updates[0].values).toMatchObject({
      stateId: 'st-2',
      districtId: 'di-2',
      city: 'Bengaluru Urban',
      pinCode: '560001',
      address: {
        line1: '9 MG Road',
        pinCode: '560001',
        state: 'Karnataka',
        district: 'Bengaluru Urban',
        stateId: 'st-2',
        districtId: 'di-2',
      },
    });
  });

  it('records the change as an owner-actor audit entry', async () => {
    const { svc, audit } = svcWith();
    await svc.update('own-1', { name: 'Ravi K Nair' });
    expect(audit.entries[0]).toMatchObject({
      action: 'owner.profile.updated',
      entity: 'owner',
      entityId: 'own-1',
      actorId: 'own-1',
      actorRole: 'OWNER',
    });
    expect(audit.entries[0].before).toBeDefined();
    expect(audit.entries[0].after).toBeDefined();
  });

  it('rejects an empty patch', async () => {
    const { svc } = svcWith();
    await expect(svc.update('own-1', {})).rejects.toMatchObject({
      response: { error: 'NOTHING_TO_UPDATE' },
    });
  });
});
