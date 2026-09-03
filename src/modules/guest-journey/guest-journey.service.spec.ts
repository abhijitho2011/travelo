import { GuestJourneyService } from './guest-journey.service';
import { mockDb } from '../owner-auth/testing/db.mock';

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
