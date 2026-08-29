import { installTestEnv } from './security-harness';
installTestEnv();

import request from 'supertest';
import type { Harness } from './security-harness';
import { authenticatedRoutes, adminPermissionRoutes } from './fixtures';
import { adminToken } from './tokens';

/**
 * Proves the harness itself is honest before anything is concluded from it.
 *
 * If the fake database, the token helpers or the global prefix were wrong,
 * every rejection test downstream would pass for the wrong reason — a 404
 * because the route does not exist reads exactly like a 404 because the tenant
 * check worked. These four assertions rule that out.
 */
describe('security harness', () => {
  let h: Harness;

  beforeAll(async () => {
    const { bootSecurityApp } = await import('./security-harness');
    h = await bootSecurityApp({
      ...authenticatedRoutes(),
      ...adminPermissionRoutes({ 'admin-1': ['owner.view'] }),
    });
  }, 60_000);

  afterAll(async () => {
    await h?.close();
  });

  it('serves the unprefixed health route', async () => {
    await request(h.app.getHttpServer()).get('/health/live').expect(200);
  });

  it('mounts the admin API under /api/v1/admin', async () => {
    await request(h.app.getHttpServer()).get('/api/v1/admin/owners').expect(401);
  });

  it('lets a fully valid admin through to a route they are permitted', async () => {
    const res = await request(h.app.getHttpServer())
      .get('/api/v1/admin/owners')
      .set('authorization', `Bearer ${adminToken()}`);
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
  });

  it('does NOT apply the admin prefix to the owner and staff surfaces', async () => {
    // 401 (not 404) proves the route exists and its guard ran.
    await request(h.app.getHttpServer()).get('/api/v1/owner/profile').expect(401);
    await request(h.app.getHttpServer()).get('/api/v1/staff/auth/me').expect(401);
  });
});
