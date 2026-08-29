import { Test } from '@nestjs/testing';

/**
 * Compiles the real dependency-injection graph.
 *
 * `tsc` cannot see DI wiring and every other suite mocks its dependencies, so a
 * provider missing from a module's `imports` passes the build AND the whole test
 * suite, then takes production down at boot. That has now happened twice —
 * StorageService, and NotificationDeliveryService missing from BillingModule.
 * This test fails first instead.
 *
 * Nothing connects: `compile()` resolves providers without opening a socket, so
 * no database, Redis or credentials are required.
 *
 * Env is set here at module scope because `config.module.ts` validates on
 * import, which happens before any `beforeAll` — hence the dynamic import below.
 */
process.env.DATABASE_URL ??= 'postgres://user:pass@db.invalid:5432/tavelo';
process.env.JWT_ACCESS_SECRET ??= 'test-access-secret-at-least-32-chars-long';
process.env.JWT_REFRESH_SECRET ??= 'test-refresh-secret-at-least-32-chars-long';

describe('application wiring', () => {
  it('resolves every provider in the module graph', async () => {
    const { AppModule } = await import('./app.module');

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    expect(moduleRef).toBeDefined();
    await moduleRef.close();
  }, 60_000);
});
