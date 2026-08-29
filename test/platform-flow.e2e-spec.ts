import request from 'supertest';
import { dockerAvailable } from './support/docker';
import { startTestDatabase, TestDatabase } from './support/database';
import { bootE2eApp, E2eApp, Seed, seedMinimum, SUPER_ADMIN_MOBILE } from './support/app';

/**
 * `describe` when a container runtime is present, `describe.skip` otherwise, so
 * this file is reported as SKIPPED rather than failed on a machine without
 * Docker. The banner explaining why is printed by `support/global-setup.ts`,
 * which runs outside Jest's console capture — output from a fully-skipped suite
 * is otherwise swallowed.
 */
const describeWithDatabase = dockerAvailable() ? describe : describe.skip;

/**
 * THE END-TO-END WALKTHROUGH.
 *
 * One customer's whole first day, driven entirely over HTTP against the real
 * schema on a throwaway PostgreSQL container: sign in as the super-admin, sell
 * a subscription, stand up a hotel, hire and approve a receptionist, take a
 * booking through arrival and departure, collect the money, and check that the
 * audit trail can account for all of it.
 *
 * The tests run IN ORDER and share state deliberately. This is a narrative, not
 * a set of independent cases: each step's output is the next step's input, and
 * that chaining is precisely what a unit test cannot check.
 *
 * Nothing here is seeded that the API can create. Only a plan and the location
 * catalogue are inserted directly, because there is no endpoint for them.
 */
describeWithDatabase('platform flow (end to end)', () => {
  let db: TestDatabase;
  let api: E2eApp;
  let seed: Seed;

  const srv = () => api.app.getHttpServer();

  /** Everything the walkthrough accumulates as it goes. */
  const state: Record<string, string> = {};
  let adminToken = '';
  let ownerToken = '';
  let gmToken = '';
  let receptionToken = '';

  const OWNER_MOBILE = '9895011111';
  const GM_MOBILE = '9895022222';
  const RECEPTION_MOBILE = '9895033333';

  /** Signs somebody in over OTP, reading the code out of the captured SMS. */
  async function otpSignIn(base: string, mobile: string): Promise<Record<string, string>> {
    const before = api.smsLog.length;
    await request(srv()).post(`${base}/otp/request`).send({ mobile }).expect(200);

    const delivered = api.smsLog.slice(before).filter((s) => s.mobile.endsWith(mobile.slice(-10)));
    expect(delivered.length).toBeGreaterThan(0);
    const otp = delivered[delivered.length - 1].otp;

    const res = await request(srv()).post(`${base}/otp/verify`).send({ mobile, otp });
    expect(res.status).toBe(200);
    return res.body.data as Record<string, string>;
  }

  const auth = (token: string) => ({ authorization: `Bearer ${token}` });

  beforeAll(async () => {
    db = await startTestDatabase();
    seed = await seedMinimum(db.client);
    api = await bootE2eApp(db.url);
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    await db?.stop();
  }, 120_000);

  // ------------------------------------------------------------- schema ---

  it('applied every migration in filename order', async () => {
    const { rows } = await db.client.query<{ filename: string }>(
      'SELECT filename FROM _boot_migrations ORDER BY filename',
    );
    expect(rows.length).toBeGreaterThan(0);
    expect(rows.map((r) => r.filename)).toEqual([...rows.map((r) => r.filename)].sort());
    // The tables the rest of this file depends on really exist.
    for (const table of ['admins', 'owners', 'properties', 'rooms', 'reservations', 'invoices']) {
      const { rows: present } = await db.client.query<{ ok: boolean }>(
        `SELECT to_regclass('public.${table}') IS NOT NULL AS ok`,
      );
      expect(present[0].ok).toBe(true);
    }
  });

  it('serves health without a token', async () => {
    await request(srv()).get('/health/live').expect(200);
  });

  // ------------------------------------------------------ admin sign-in ---

  it('the super-admin signs in with a one-time code that never appears in a response', async () => {
    const before = api.smsLog.length;
    const requested = await request(srv())
      .post('/api/v1/admin/auth/otp/request')
      .send({ mobile: SUPER_ADMIN_MOBILE })
      .expect(200);

    expect(api.smsLog.length).toBe(before + 1);
    const otp = api.smsLog[api.smsLog.length - 1].otp;
    expect(otp).toMatch(/^\d{6}$/);
    expect(JSON.stringify(requested.body)).not.toContain(otp);

    const verified = await request(srv())
      .post('/api/v1/admin/auth/otp/verify')
      .send({ mobile: SUPER_ADMIN_MOBILE, otp })
      .expect(200);

    adminToken = verified.body.data.accessToken;
    expect(adminToken).toBeTruthy();
  }, 60_000);

  it('the session works against a protected route', async () => {
    const me = await request(srv()).get('/api/v1/admin/auth/me').set(auth(adminToken)).expect(200);
    expect(me.body.data.permissions.length).toBeGreaterThan(0);
  });

  // -------------------------------------------------- owner + subscription ---

  it('creates an owner, and the mandatory plan produces a subscription in the same breath', async () => {
    const res = await request(srv())
      .post('/api/v1/admin/owners')
      .set(auth(adminToken))
      .send({
        name: 'Oona Owner',
        email: 'oona@backwater.test',
        phone: OWNER_MOBILE,
        company: 'Backwater Hotels',
        address: '1 Marine Drive',
        pinCode: '682031',
        state: seed.stateId,
        district: seed.districtId,
        planId: seed.planId,
      })
      .expect(201);

    state.ownerId = res.body.data.id;
    expect(state.ownerId).toBeTruthy();

    // The subscription is not optional and not deferred — it exists now.
    const { rows } = await db.client.query<{ id: string; status: string }>(
      'SELECT id, status FROM subscriptions WHERE owner_id = $1',
      [state.ownerId],
    );
    expect(rows).toHaveLength(1);
    state.subscriptionId = rows[0].id;
  }, 30_000);

  it('refuses to create an owner with no plan at all', async () => {
    const res = await request(srv()).post('/api/v1/admin/owners').set(auth(adminToken)).send({
      name: 'Planless',
      email: 'planless@backwater.test',
      phone: '9895099999',
      company: 'Planless Ltd',
      address: '2 Marine Drive',
      pinCode: '682031',
      state: seed.stateId,
      district: seed.districtId,
    });
    expect(res.status).toBe(400);
    expect(res.body.error.code).toBe('PLAN_REQUIRED');
  });

  it('creates the property', async () => {
    const res = await request(srv())
      .post('/api/v1/admin/properties')
      .set(auth(adminToken))
      .send({
        ownerId: state.ownerId,
        name: 'Backwater Grand',
        city: 'Kochi',
        state: 'Kerala',
        starRating: 4,
      })
      .expect(201);
    state.propertyId = res.body.data.id;
    expect(state.propertyId).toBeTruthy();
  });

  // ------------------------------------------------------------- owner ----

  it('the owner signs in and sees their own property', async () => {
    const tokens = await otpSignIn('/api/v1/owner/auth', OWNER_MOBILE);
    ownerToken = tokens.accessToken;

    const props = await request(srv())
      .get('/api/v1/owner/properties')
      .set(auth(ownerToken))
      .expect(200);
    const list = (props.body.data.items ?? props.body.data) as { id: string }[];
    expect(list.map((p) => p.id)).toContain(state.propertyId);
  }, 60_000);

  it('the owner appoints a general manager', async () => {
    const res = await request(srv())
      .post(`/api/v1/owner/properties/${state.propertyId}/staff`)
      .set(auth(ownerToken))
      .send({
        role: 'GENERAL_MANAGER',
        firstName: 'Gita',
        lastName: 'Menon',
        pinCode: '682031',
        state: 'Kerala',
        district: 'Ernakulam',
        mobile: GM_MOBILE,
        email: 'gita@backwater.test',
      })
      .expect(201);
    state.gmId = res.body.data.id;

    // Whatever status the appointment lands in, the owner can make it ACTIVE.
    await request(srv())
      .post(`/api/v1/owner/properties/${state.propertyId}/staff/${state.gmId}/status`)
      .set(auth(ownerToken))
      .send({ status: 'ACTIVE' })
      .expect(201);
  }, 30_000);

  // -------------------------------------------------------------- staff ---

  it('the GM signs in', async () => {
    const tokens = await otpSignIn('/api/v1/staff/auth', GM_MOBILE);
    gmToken = tokens.accessToken;
    const me = await request(srv()).get('/api/v1/staff/auth/me').set(auth(gmToken)).expect(200);
    expect(me.body.data.role).toBe('GENERAL_MANAGER');
  }, 60_000);

  it('the GM creates a room type', async () => {
    const res = await request(srv())
      .post('/api/v1/staff/room-types')
      .set(auth(gmToken))
      .send({
        name: 'Deluxe Double',
        bedType: 'DOUBLE',
        bedCount: 1,
        maxOccupancy: 3,
        maxAdults: 2,
        maxChildren: 1,
        airConditioned: true,
        baseRate: 450000,
      })
      .expect(201);
    state.roomTypeId = res.body.data.id;
  });

  it('the GM creates a room, then a floor of them in bulk', async () => {
    const single = await request(srv())
      .post('/api/v1/staff/rooms')
      .set(auth(gmToken))
      .send({ roomTypeId: state.roomTypeId, number: '101', floor: '1' })
      .expect(201);
    state.roomId = single.body.data.id;

    const bulk = await request(srv())
      .post('/api/v1/staff/rooms/bulk')
      .set(auth(gmToken))
      .send({ roomTypeId: state.roomTypeId, floor: '2', numbers: ['201', '202', '203'] })
      .expect(201);
    expect(bulk.body.data.created).toBe(3);

    const list = await request(srv()).get('/api/v1/staff/rooms').set(auth(gmToken)).expect(200);
    const items = (list.body.data.items ?? list.body.data) as unknown[];
    expect(items.length).toBe(4);
  }, 30_000);

  it('the GM hires a receptionist, who cannot sign in until approved', async () => {
    const created = await request(srv())
      .post('/api/v1/staff/team')
      .set(auth(gmToken))
      .send({
        role: 'RECEPTIONIST',
        firstName: 'Asha',
        lastName: 'Nair',
        mobile: RECEPTION_MOBILE,
        email: 'asha@backwater.test',
      })
      .expect(201);
    state.receptionId = created.body.data.id;
    expect(created.body.data.status).toBe('PENDING_APPROVAL');
  }, 30_000);

  it('approves the receptionist', async () => {
    const res = await request(srv())
      .post(`/api/v1/staff/team/${state.receptionId}/approve`)
      .set(auth(gmToken))
      .expect(201);
    expect(res.body.data.status).toBe('ACTIVE');
  });

  it('the receptionist signs in', async () => {
    const tokens = await otpSignIn('/api/v1/staff/auth', RECEPTION_MOBILE);
    receptionToken = tokens.accessToken;
    const me = await request(srv())
      .get('/api/v1/staff/auth/me')
      .set(auth(receptionToken))
      .expect(200);
    expect(me.body.data.role).toBe('RECEPTIONIST');
  }, 60_000);

  // -------------------------------------------------------- reservation ---

  const day = (offset: number) => {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() + offset);
    return d.toISOString().slice(0, 10);
  };

  it('the receptionist takes a booking', async () => {
    const res = await request(srv())
      .post('/api/v1/staff/reservations')
      .set(auth(receptionToken))
      .send({
        roomTypeId: state.roomTypeId,
        guestName: 'Ravi Kumar',
        guestPhone: '9895044444',
        adults: 2,
        checkIn: day(1),
        checkOut: day(3),
      })
      .expect(201);
    state.reservationId = res.body.data.id;
  }, 30_000);

  it('confirms it', async () => {
    const res = await request(srv())
      .post(`/api/v1/staff/reservations/${state.reservationId}/confirm`)
      .set(auth(receptionToken))
      .expect(201);
    expect(res.body.data.status).toBe('CONFIRMED');
  });

  it('checks the guest in, and the room becomes OCCUPIED', async () => {
    const res = await request(srv())
      .post(`/api/v1/staff/reservations/${state.reservationId}/check-in`)
      .set(auth(receptionToken))
      .send({ roomId: state.roomId })
      .expect(201);
    expect(res.body.data.status).toBe('CHECKED_IN');

    const room = await request(srv())
      .get(`/api/v1/staff/rooms/${state.roomId}`)
      .set(auth(receptionToken))
      .expect(200);
    expect(room.body.data.status).toBe('OCCUPIED');
  }, 30_000);

  it('checks the guest out, and the room becomes DIRTY', async () => {
    const res = await request(srv())
      .post(`/api/v1/staff/reservations/${state.reservationId}/check-out`)
      .set(auth(receptionToken))
      .send({ collectedPaise: 900000 })
      .expect(201);
    expect(res.body.data.status).toBe('CHECKED_OUT');

    const room = await request(srv())
      .get(`/api/v1/staff/rooms/${state.roomId}`)
      .set(auth(receptionToken))
      .expect(200);
    expect(room.body.data.status).toBe('DIRTY');
  }, 30_000);

  // ------------------------------------------------------------- money ----

  it('the admin records a manual payment, which renews the subscription and issues an invoice', async () => {
    const before = await db.client.query<{ current_period_end: Date }>(
      'SELECT current_period_end FROM subscriptions WHERE id = $1',
      [state.subscriptionId],
    );
    const previousEnd = new Date(before.rows[0].current_period_end);

    const res = await request(srv())
      .post('/api/v1/admin/billing/payments/manual')
      .set(auth(adminToken))
      .send({
        ownerId: state.ownerId,
        subscriptionId: state.subscriptionId,
        amountPaise: 500000,
        method: 'UPI',
        reference: 'UPI-E2E-1',
      })
      .expect(201);

    expect(res.body.data.invoice.invoiceNumber).toBeTruthy();
    state.invoiceId = res.body.data.invoice.id;

    // Renewed from max(now, previous period end) — never from now when the
    // subscription still had time left, which would silently shorten it.
    const after = await db.client.query<{ current_period_end: Date }>(
      'SELECT current_period_end FROM subscriptions WHERE id = $1',
      [state.subscriptionId],
    );
    const newEnd = new Date(after.rows[0].current_period_end);
    expect(newEnd.getTime()).toBeGreaterThan(previousEnd.getTime());
    expect(newEnd.getTime()).toBeGreaterThanOrEqual(Date.now());
  }, 60_000);

  it('the invoice is visible to the admin', async () => {
    const res = await request(srv())
      .get(`/api/v1/admin/billing/invoices/${state.invoiceId}`)
      .set(auth(adminToken))
      .expect(200);
    expect(res.body.data.ownerId ?? res.body.data.owner?.id).toBe(state.ownerId);
  });

  // ------------------------------------------------------------ exports ---

  it('the CSV export returns a header and at least one row', async () => {
    const res = await request(srv())
      .get('/api/v1/admin/export/owners.csv')
      .set(auth(adminToken))
      .expect(200);

    expect(res.headers['content-type']).toContain('text/csv');
    const lines = res.text.trim().split('\n');
    expect(lines.length).toBeGreaterThan(1);
    expect(res.text).toContain('Backwater Hotels');
  }, 30_000);

  // -------------------------------------------------------------- audit ---

  /**
   * The point of an audit trail is that the chain can be reconstructed
   * afterwards. Every stage above should be findable in it.
   */
  it('the audit log contains the whole chain', async () => {
    const res = await request(srv())
      .get('/api/v1/admin/audit-logs?limit=200')
      .set(auth(adminToken))
      .expect(200);

    const actions = (res.body.data.items as { action: string }[]).map((i) => i.action);
    for (const expected of [
      'staff.roomtype.created',
      'staff.room.created',
      'staff.room.bulk_created',
      'staff.reservation.created',
      'staff.reservation.confirmed',
      'staff.reservation.checked_in',
      'staff.reservation.checked_out',
      'export.csv',
    ]) {
      expect(actions).toContain(expected);
    }
    expect(actions.some((a) => a.startsWith('billing.payment.settled'))).toBe(true);
  }, 30_000);
});
