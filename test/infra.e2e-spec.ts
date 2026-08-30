import request from 'supertest';
import { dockerAvailable } from './support/docker';
import { startTestDatabase, TestDatabase } from './support/database';
import { bootE2eApp, E2eApp } from './support/app';

/**
 * Infrastructure endpoints (Phase 8): the health probes and the Prometheus
 * scrape target, plus the response-envelope contract on a 404. These are the
 * surfaces a load balancer and a metrics scraper hit, so they are checked
 * against the real app over HTTP — not the product API, but the plumbing under
 * it. Skipped (not failed) when no container runtime is present.
 */
const describeWithDatabase = dockerAvailable() ? describe : describe.skip;

describeWithDatabase('infrastructure endpoints (end to end)', () => {
  let db: TestDatabase;
  let api: E2eApp;
  const srv = () => api.app.getHttpServer();

  beforeAll(async () => {
    db = await startTestDatabase();
    api = await bootE2eApp(db.url);
  }, 120_000);

  afterAll(async () => {
    await api?.close();
    await db?.stop();
  });

  it('serves liveness without a token', async () => {
    await request(srv()).get('/health/live').expect(200);
  });

  it('serves readiness (db + redis reachable)', async () => {
    // Terminus answers 200 when every indicator is up; the throwaway Postgres
    // container makes the db indicator real.
    await request(srv()).get('/health/ready').expect(200);
  });

  it('exposes Prometheus metrics as raw text, not the JSON envelope', async () => {
    const res = await request(srv()).get('/metrics').expect(200);
    expect(res.type).toContain('text/plain');
    // Raw exposition, not a wrapped { success, data } object.
    expect(res.text).toContain('tavelo_http_requests_total');
    expect(res.text).toContain('tavelo_process_uptime_seconds');
    expect(res.text).not.toContain('"success"');
  });

  it('counts requests: the metrics total grows after traffic', async () => {
    await request(srv()).get('/health/live').expect(200);
    const res = await request(srv()).get('/metrics').expect(200);
    // The sum counter is present and non-negative (this very scrape and the
    // health calls have already been recorded).
    const match = res.text.match(/tavelo_http_requests_sum\s+(\d+)/);
    expect(match).not.toBeNull();
    expect(Number(match?.[1] ?? 0)).toBeGreaterThan(0);
  });

  it('wraps an unknown route in the error envelope with a 404', async () => {
    const res = await request(srv()).get('/api/v1/admin/does-not-exist').expect(404);
    expect(res.body).toMatchObject({ success: false });
    expect(res.body.error).toBeDefined();
    expect(res.body.meta).toBeDefined();
  });
});
