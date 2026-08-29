import { INestApplication, RequestMethod } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import type { Client } from 'pg';

/**
 * Boots the REAL application against the REAL schema.
 *
 * Nothing is mocked here except the SMS provider, and that only so the test can
 * read the one-time code the server refuses to put in a response body — which
 * is the correct behaviour and the reason a capture is needed at all.
 *
 * As in the unit suite, `config.module.ts` validates the environment when it is
 * imported, so every variable must be in place before `app.module` is required.
 * `bootE2eApp` therefore takes the database URL as an argument and imports the
 * module graph dynamically, after setting it.
 */
export interface E2eApp {
  app: INestApplication;
  /** Codes the server tried to SMS, oldest first. */
  smsLog: { mobile: string; otp: string }[];
  close(): Promise<void>;
}

export const SUPER_ADMIN_MOBILE = '9895077492';
export const SUPER_ADMIN_EMAIL = 'admin@tavelo.test';

export async function bootE2eApp(databaseUrl: string): Promise<E2eApp> {
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = databaseUrl;
  delete process.env.DATABASE_PUBLIC_URL;
  delete process.env.REDIS_URL;
  process.env.LOG_LEVEL = 'fatal';
  process.env.API_PREFIX = '/api/v1/admin';
  process.env.JWT_ACCESS_SECRET = 'e2e-admin-access-secret-32-chars-long';
  process.env.JWT_REFRESH_SECRET = 'e2e-admin-refresh-secret-32-chars-long';
  process.env.OWNER_JWT_ACCESS_SECRET = 'e2e-owner-access-secret-32-chars-long';
  process.env.OWNER_JWT_REFRESH_SECRET = 'e2e-owner-refresh-secret-32-chars-lng';
  process.env.STAFF_JWT_ACCESS_SECRET = 'e2e-staff-access-secret-32-chars-long';
  process.env.STAFF_JWT_REFRESH_SECRET = 'e2e-staff-refresh-secret-32-chars-lng';
  process.env.SUPER_ADMIN_MOBILE = SUPER_ADMIN_MOBILE;
  process.env.SUPER_ADMIN_EMAIL = SUPER_ADMIN_EMAIL;
  // High enough that a scripted end-to-end walk is never throttled; throttling
  // itself is proved in `src/security/throttling.security.spec.ts`.
  process.env.THROTTLE_LIMIT = '10000';

  const { AppModule } = await import('../../src/app.module');
  const { SMS_PROVIDER } = await import('../../src/modules/shared-auth/sms/sms-provider.interface');

  const smsLog: { mobile: string; otp: string }[] = [];
  const moduleRef = await Test.createTestingModule({ imports: [AppModule] })
    .overrideProvider(SMS_PROVIDER)
    .useValue({
      sendOtp: async (mobile: string, otp: string) => {
        smsLog.push({ mobile, otp });
      },
      sendText: async () => undefined,
    })
    .compile();

  const app = moduleRef.createNestApplication({ logger: false });
  // Mirrors main.ts exactly. If these drift, the E2E suite 404s and says so.
  app.setGlobalPrefix(process.env.API_PREFIX, {
    exclude: [
      { path: 'health', method: RequestMethod.ALL },
      { path: 'health/live', method: RequestMethod.ALL },
      { path: 'health/ready', method: RequestMethod.ALL },
      { path: 'api/v1/owner/(.*)', method: RequestMethod.ALL },
      { path: 'api/v1/staff/(.*)', method: RequestMethod.ALL },
    ],
  });
  await app.init();

  return { app, smsLog, close: () => app.close() };
}

/**
 * The minimum a fresh database needs before the API can be driven.
 *
 * Everything else in the walkthrough — the owner, the property, the rooms, the
 * staff — is created THROUGH the API, because creating it directly would test
 * the fixture rather than the product. Only the things the API has no endpoint
 * to create are inserted here.
 */
export interface Seed {
  planId: string;
  stateId: string;
  districtId: string;
}

export async function seedMinimum(client: Client): Promise<Seed> {
  const plan = await client.query<{ id: string }>(
    `INSERT INTO subscription_plans (name, description, monthly_price, annual_price, duration_months, property_limit, status)
     VALUES ('E2E Standard', 'plan used by the end-to-end walkthrough', 500000, 5000000, 1, 5, 'ACTIVE')
     RETURNING id`,
  );
  const state = await client.query<{ id: string }>(
    `INSERT INTO location_states (name) VALUES ('Kerala') RETURNING id`,
  );
  const district = await client.query<{ id: string }>(
    `INSERT INTO location_districts (state_id, name) VALUES ($1, 'Ernakulam') RETURNING id`,
    [state.rows[0].id],
  );
  return {
    planId: plan.rows[0].id,
    stateId: state.rows[0].id,
    districtId: district.rows[0].id,
  };
}
