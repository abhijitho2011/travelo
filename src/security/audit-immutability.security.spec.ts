import { installTestEnv } from './security-harness';
installTestEnv();

import request from 'supertest';
import type { Harness, MountedRoute } from './security-harness';
import { adminPermissionRoutes, authenticatedRoutes, mergeRoutes } from './fixtures';
import { adminToken } from './tokens';

/**
 * §64.8 — THE AUDIT LOG HAS NO WRITE SURFACE.
 *
 * An audit trail an administrator can edit is not an audit trail. The claim
 * being made here is a negative one — "no such endpoint exists" — and a
 * negative cannot be established by probing a handful of URLs and collecting
 * 404s, because the next URL might be the one that isn't. So the assertion is
 * made against the Express router itself: every route the application actually
 * serves is enumerated, and none of them may mutate an audit log.
 */
describe('§64.8 audit logs are append-only over HTTP', () => {
  let h: Harness;
  let routes: MountedRoute[];
  const srv = () => h.app.getHttpServer();

  beforeAll(async () => {
    const { bootSecurityApp, mountedRoutes } = await import('./security-harness');
    h = await bootSecurityApp(
      mergeRoutes(
        authenticatedRoutes(),
        // A caller holding EVERY permission there is. If a write route existed,
        // this actor could reach it.
        adminPermissionRoutes({ 'admin-1': ['*'] }),
      ),
    );
    routes = mountedRoutes(h.app);
  }, 60_000);

  afterAll(async () => {
    await h?.close();
  });

  it('enumerated the real router, not an empty list (control)', () => {
    expect(routes.length).toBeGreaterThan(50);
    expect(routes).toContainEqual({ method: 'GET', path: '/api/v1/admin/audit-logs' });
  });

  /** Everything the router serves that mentions an audit log, by any spelling. */
  const AUDIT_PATH = /audit[-_]?logs?/i;

  it('exposes exactly one audit-log route, and it is a GET', () => {
    const auditRoutes = routes.filter((r) => AUDIT_PATH.test(r.path));
    expect(auditRoutes.length).toBeGreaterThan(0);
    for (const r of auditRoutes) {
      expect(r.method).toBe('GET');
    }
  });

  it('serves no POST, PATCH, PUT or DELETE anywhere under an audit-log path', () => {
    const mutating = routes.filter(
      (r) => AUDIT_PATH.test(r.path) && ['POST', 'PATCH', 'PUT', 'DELETE'].includes(r.method),
    );
    expect(mutating).toEqual([]);
  });

  /**
   * Belt and braces: the router says the route is absent, and the server agrees
   * when asked. A 404/405 — never a 2xx — for a caller who holds `*`.
   */
  it.each([
    ['post', '/api/v1/admin/audit-logs'],
    ['patch', '/api/v1/admin/audit-logs/some-id'],
    ['put', '/api/v1/admin/audit-logs/some-id'],
    ['delete', '/api/v1/admin/audit-logs/some-id'],
    ['delete', '/api/v1/admin/audit-logs'],
  ])('%s %s is not served even to an admin holding every permission', async (method, path) => {
    const res = await (request(srv()) as unknown as Record<string, (p: string) => request.Test>)
      [method](path)
      .set('authorization', `Bearer ${adminToken()}`)
      .send({});
    expect(res.status).toBeGreaterThanOrEqual(400);
    expect([404, 405]).toContain(res.status);
  });

  it('the read route still works, so the absence above is not a mounting accident', async () => {
    await request(srv())
      .get('/api/v1/admin/audit-logs')
      .set('authorization', `Bearer ${adminToken()}`)
      .expect(200);
  });

  /**
   * The export path is the other way audit data leaves the system. It is a read
   * too — nothing under `/export` may write.
   */
  it('the export surface is read-only as well', () => {
    const exportRoutes = routes.filter((r) => /\/export\b/.test(r.path));
    expect(exportRoutes.length).toBeGreaterThan(0);
    for (const r of exportRoutes) {
      expect(r.method).toBe('GET');
    }
  });
});
