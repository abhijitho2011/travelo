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
 * TWO REAL TENANTS, ONE REAL DATABASE.
 *
 * `src/security/cross-tenant.security.spec.ts` proves the services BUILD a
 * scoped query. This proves the scoping actually holds when both tenants' rows
 * genuinely coexist in the same tables — the failure mode a mocked database can
 * never reproduce, because there is nothing else in it to leak.
 */
describeWithDatabase('tenant isolation (end to end)', () => {
  let db: TestDatabase;
  let api: E2eApp;
  let seed: Seed;

  const srv = () => api.app.getHttpServer();
  const auth = (t: string) => ({ authorization: `Bearer ${t}` });

  let adminToken = '';
  const alice = { mobile: '9895055551', id: '', propertyId: '', token: '' };
  const bob = { mobile: '9895055552', id: '', propertyId: '', token: '' };

  async function otpSignIn(base: string, mobile: string): Promise<string> {
    const before = api.smsLog.length;
    await request(srv()).post(`${base}/otp/request`).send({ mobile }).expect(200);
    const delivered = api.smsLog.slice(before);
    expect(delivered.length).toBeGreaterThan(0);
    const res = await request(srv())
      .post(`${base}/otp/verify`)
      .send({ mobile, otp: delivered[delivered.length - 1].otp })
      .expect(200);
    return res.body.data.accessToken as string;
  }

  async function createOwner(name: string, mobile: string, email: string): Promise<string> {
    const res = await request(srv())
      .post('/api/v1/admin/owners')
      .set(auth(adminToken))
      .send({
        name,
        email,
        phone: mobile,
        company: `${name} Hotels`,
        address: '1 Marine Drive',
        pinCode: '682031',
        state: seed.stateId,
        district: seed.districtId,
        planId: seed.planId,
      })
      .expect(201);
    return res.body.data.id as string;
  }

  async function createProperty(ownerId: string, name: string): Promise<string> {
    const res = await request(srv())
      .post('/api/v1/admin/properties')
      .set(auth(adminToken))
      .send({ ownerId, name, city: 'Kochi', state: 'Kerala' })
      .expect(201);
    return res.body.data.id as string;
  }

  beforeAll(async () => {
    db = await startTestDatabase();
    seed = await seedMinimum(db.client);
    api = await bootE2eApp(db.url);

    // Admin sign-in.
    const before = api.smsLog.length;
    await request(srv())
      .post('/api/v1/admin/auth/otp/request')
      .send({ mobile: SUPER_ADMIN_MOBILE })
      .expect(200);
    const otp = api.smsLog[before].otp;
    const verified = await request(srv())
      .post('/api/v1/admin/auth/otp/verify')
      .send({ mobile: SUPER_ADMIN_MOBILE, otp })
      .expect(200);
    adminToken = verified.body.data.accessToken;

    alice.id = await createOwner('Alice', alice.mobile, 'alice@a.test');
    bob.id = await createOwner('Bob', bob.mobile, 'bob@b.test');
    alice.propertyId = await createProperty(alice.id, 'Alice Grand');
    bob.propertyId = await createProperty(bob.id, 'Bob Grand');
    alice.token = await otpSignIn('/api/v1/owner/auth', alice.mobile);
    bob.token = await otpSignIn('/api/v1/owner/auth', bob.mobile);
  }, 300_000);

  afterAll(async () => {
    await api?.close();
    await db?.stop();
  }, 120_000);

  it('both tenants really exist side by side (control)', async () => {
    const all = await request(srv()).get('/api/v1/admin/owners').set(auth(adminToken)).expect(200);
    const ids = (all.body.data.items as { id: string }[]).map((o) => o.id);
    expect(ids).toEqual(expect.arrayContaining([alice.id, bob.id]));
  });

  it('an owner’s property list contains only their own', async () => {
    const res = await request(srv())
      .get('/api/v1/owner/properties')
      .set(auth(alice.token))
      .expect(200);
    const items = (res.body.data.items ?? res.body.data) as { id: string }[];
    const ids = items.map((p) => p.id);
    expect(ids).toContain(alice.propertyId);
    expect(ids).not.toContain(bob.propertyId);
  });

  it('reaching for the other tenant’s property by id is 404, not 403', async () => {
    for (const path of [
      `/api/v1/owner/properties/${bob.propertyId}/rooms`,
      `/api/v1/owner/properties/${bob.propertyId}/room-types`,
      `/api/v1/owner/properties/${bob.propertyId}/staff`,
      `/api/v1/owner/properties/${bob.propertyId}/photos`,
    ]) {
      // eslint-disable-next-line no-await-in-loop
      const res = await request(srv()).get(path).set(auth(alice.token));
      expect({ path, status: res.status }).toEqual({ path, status: 404 });
    }
  }, 30_000);

  it('an owner’s profile and portfolio never mention the other tenant', async () => {
    const me = await request(srv()).get('/api/v1/owner/auth/me').set(auth(alice.token)).expect(200);
    expect(JSON.stringify(me.body)).not.toContain(bob.id);

    const summary = await request(srv())
      .get('/api/v1/owner/portfolio/summary')
      .set(auth(alice.token))
      .expect(200);
    expect(JSON.stringify(summary.body)).not.toContain(bob.propertyId);
  });

  it('an owner’s invoices are their own', async () => {
    const res = await request(srv())
      .get('/api/v1/owner/subscription/invoices')
      .set(auth(alice.token))
      .expect(200);
    expect(JSON.stringify(res.body)).not.toContain(bob.id);
  });

  it('the other owner sees the mirror image', async () => {
    const res = await request(srv())
      .get('/api/v1/owner/properties')
      .set(auth(bob.token))
      .expect(200);
    const items = (res.body.data.items ?? res.body.data) as { id: string }[];
    const ids = items.map((p) => p.id);
    expect(ids).toContain(bob.propertyId);
    expect(ids).not.toContain(alice.propertyId);
  });

  it('an owner token cannot reach the admin surface at all', async () => {
    await request(srv()).get('/api/v1/admin/owners').set(auth(alice.token)).expect(401);
  });
});
