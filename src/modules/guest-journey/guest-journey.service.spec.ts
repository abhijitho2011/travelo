import { GuestJourneyService } from './guest-journey.service';
import { mockDb, sqlText } from '../owner-auth/testing/db.mock';

const IN = new Date(Date.now() + 5 * 86_400_000).toISOString().slice(0, 10);
const OUT = new Date(Date.now() + 7 * 86_400_000).toISOString().slice(0, 10);
const stay = (over = {}) => ({
  id: 'res-1',
  propertyId: 'p',
  reservationNumber: 'RES-1',
  guestName: 'Asha',
  guestPhone: '9876543210',
  guestEmail: null,
  status: 'CONFIRMED',
  checkIn: IN,
  checkOut: OUT,
  roomTypeId: 't1',
  roomId: null,
  adults: 2,
  children: 0,
  notes: null,
  guestIdProofKey: null,
  guestPhotoKey: null,
  guestIdType: null,
  guestIdNumber: null,
  deletedAt: null,
  ...over,
});

function svc(db: ReturnType<typeof mockDb>, over: Record<string, unknown> = {}) {
  const deps = {
    reservations: {
      requireReservation: jest.fn(async () => stay()),
      update: jest.fn(async () => stay()),
    },
    folio: {
      summary: jest.fn(async () => ({
        subtotalPaise: 0,
        taxPaise: 0,
        chargesPaise: 0,
        netPaidPaise: 0,
        balancePaise: 0,
        lineItems: [],
      })),
      postCharge: jest.fn(async () => ({ id: 'l1' })),
    },
    config: { listAddons: jest.fn(async () => []) },
    storage: {
      put: jest.fn(async () => undefined),
      getSignedUrl: jest.fn(async () => 'https://signed'),
    },
    notifications: { notifyQuietly: jest.fn(async () => undefined) },
    realtime: { emit: jest.fn() },
    ...over,
  };
  return {
    s: new GuestJourneyService(
      db as never,
      deps.reservations as never,
      deps.folio as never,
      deps.config as never,
      deps.storage as never,
      deps.notifications as never,
      deps.realtime as never,
    ),
    deps,
  };
}

describe('GuestJourneyService', () => {
  it('issues a link, stores only the hash, and sends it to the guest', async () => {
    const db = mockDb({
      insert: { guest_links: [{ id: 'gl-1' }] },
      select: { properties: [[{ name: 'Sea View' }]] },
    });
    const { s, deps } = svc(db);
    process.env['GUEST_PORTAL_URL'] = 'https://stay.example.test';
    const res = await s.issue('p', 'res-1', 'st-1');
    expect(res.url).toMatch(/^https:\/\/stay\.example\.test\/stay\/[A-Za-z0-9_-]{20,}$/);
    const written = db.inserts.find((i) => i.table === 'guest_links')?.values as {
      tokenHash: string;
    };
    expect(written.tokenHash).toHaveLength(64);
    expect(res.url).not.toContain(written.tokenHash);
    expect(deps.notifications.notifyQuietly).toHaveBeenCalledWith(
      expect.objectContaining({ key: 'guest.magic_link' }),
    );
  });

  it('refuses a link for a stay that is over', async () => {
    const { s } = svc(mockDb({}), {
      reservations: { requireReservation: jest.fn(async () => stay({ status: 'CHECKED_OUT' })) },
    });
    await expect(s.issue('p', 'res-1', null)).rejects.toMatchObject({
      response: { error: 'STAY_NOT_ACTIVE' },
    });
  });

  it('an unknown or expired token is a 404 that says nothing', async () => {
    const { s } = svc(mockDb({ select: { guest_links: [[]] } }));
    await expect(s.page('nope')).rejects.toMatchObject({ response: { error: 'LINK_NOT_FOUND' } });
  });

  it('a checkout request needs an in-house guest and tells the desk live', async () => {
    const link = {
      id: 'gl-1',
      reservationId: 'res-1',
      openedAt: new Date(),
      expiresAt: new Date(Date.now() + 1e7),
    };
    const inHouse = mockDb({
      select: { guest_links: [[link]], reservations: [[stay({ status: 'CHECKED_IN' })]] },
      update: { guest_links: [] },
    });
    const { s, deps } = svc(inHouse);
    await s.requestCheckout('tok');
    expect(deps.realtime.emit).toHaveBeenCalledWith(
      'p',
      'reservation.changed',
      expect.objectContaining({ checkoutRequested: true }),
    );

    const notYet = mockDb({
      select: { guest_links: [[link]], reservations: [[stay()]] },
      update: { guest_links: [] },
    });
    await expect(svc(notYet).s.requestCheckout('tok')).rejects.toMatchObject({
      response: { error: 'NOT_IN_HOUSE' },
    });
  });

  it('rejects the wrong file type for an ID upload and stores a key, never bytes, on the stay', async () => {
    const link = {
      id: 'gl-1',
      reservationId: 'res-1',
      openedAt: new Date(),
      expiresAt: new Date(Date.now() + 1e7),
    };
    // Two resolves (the refused upload, then the good one): queue both reads.
    const db = mockDb({
      select: { guest_links: [[link], [link]], reservations: [[stay()], [stay()]] },
      update: { reservations: [] },
    });
    const { s, deps } = svc(db);
    await expect(
      s.upload('tok', 'id', { mimetype: 'text/plain', size: 10, buffer: Buffer.from('x') }),
    ).rejects.toMatchObject({ response: { error: 'UNSUPPORTED_MEDIA_TYPE' } });
    await s.upload('tok', 'id', { mimetype: 'image/jpeg', size: 10, buffer: Buffer.from('x') });
    expect(deps.storage.put).toHaveBeenCalledWith(
      expect.stringMatching(/^guests\/res-1\/id-/),
      expect.any(Buffer),
      'image/jpeg',
    );
    expect(db.updates.find((u) => u.table === 'reservations')?.values).toMatchObject({
      guestIdProofKey: expect.stringMatching(/^guests\//),
    });
  });
});

describe('GuestJourneyService.list — the desk’s link board', () => {
  const NOW = new Date('2026-09-04T06:00:00.000Z');
  const linkRow = {
    id: 'gl-1',
    propertyId: 'p',
    reservationId: 'res-1',
    tokenHash: 'x'.repeat(64),
    sentAt: new Date('2026-09-03T10:00:00.000Z'),
    openedAt: new Date('2026-09-03T11:00:00.000Z'),
    checkinSubmittedAt: null,
    checkoutRequestedAt: null,
    expiresAt: new Date('2026-09-08T00:00:00.000Z'),
    createdAt: new Date('2026-09-03T10:00:00.000Z'),
  };
  const boardRow = (over: Record<string, unknown> = {}) => ({
    id: 'res-1',
    reservationNumber: 'RSV-000001',
    guestName: 'Asha',
    guestPhone: '9876543210',
    guestEmail: 'asha@example.test',
    checkIn: '2026-09-04',
    checkOut: '2026-09-07',
    status: 'CONFIRMED',
    roomNumber: '204',
    link: linkRow,
    ...over,
  });

  it('lists arrivals and in-house stays with their link state (or null), scoped to the property', async () => {
    const db = mockDb({
      select: {
        reservations: [
          [
            boardRow(),
            boardRow({
              id: 'res-2',
              reservationNumber: 'RSV-000002',
              guestName: 'Ravi',
              guestEmail: null,
              status: 'CHECKED_IN',
              roomNumber: null,
              link: null,
            }),
          ],
        ],
      },
    });
    const { s } = svc(db);
    const res = await s.list('p', 'today', NOW);

    expect(res).toEqual({
      items: [
        {
          reservationId: 'res-1',
          code: 'RSV-000001',
          guestName: 'Asha',
          phone: '9876543210',
          email: 'asha@example.test',
          roomNumber: '204',
          checkIn: '2026-09-04',
          checkOut: '2026-09-07',
          status: 'CONFIRMED',
          link: {
            sentAt: linkRow.sentAt,
            openedAt: linkRow.openedAt,
            checkinSubmittedAt: null,
            checkoutRequestedAt: null,
            expiresAt: linkRow.expiresAt,
          },
        },
        {
          reservationId: 'res-2',
          code: 'RSV-000002',
          guestName: 'Ravi',
          phone: '9876543210',
          email: null,
          roomNumber: null,
          checkIn: '2026-09-04',
          checkOut: '2026-09-07',
          status: 'CHECKED_IN',
          link: null,
        },
      ],
    });
    // The list route never leaks the token hash to the desk.
    expect(JSON.stringify(res)).not.toContain(linkRow.tokenHash);

    const where = sqlText(db.wheresFor('reservations')[0]);
    expect(where).toContain('property_id');
    expect(where).toContain('p');
    expect(where).toContain('deleted_at is null');
    expect(where).toContain('CHECKED_IN');
    expect(where).toContain('CONFIRMED');
    expect(where).toContain('2026-09-04');
  });

  it('the week window spans the next 7 days; all takes every future confirmed stay', async () => {
    const db = mockDb({ select: { reservations: [[], []] } });
    const { s } = svc(db);

    await s.list('p', 'week', NOW);
    const week = sqlText(db.wheresFor('reservations')[0]);
    expect(week).toContain('2026-09-04');
    expect(week).toContain('2026-09-11');

    await s.list('p', 'all', NOW);
    const all = sqlText(db.wheresFor('reservations')[1]);
    expect(all).toContain('2026-09-04');
    expect(all).not.toContain('2026-09-11');
  });

  it('returns the same link shape as the per-reservation status route', async () => {
    const db = mockDb({ select: { guest_links: [[linkRow]] } });
    const { s } = svc(db);
    const status = await s.status('p', 'res-1');
    expect(status.link).toEqual(GuestJourneyService.linkState(linkRow));
    expect(status.link).not.toHaveProperty('tokenHash');
  });
});
