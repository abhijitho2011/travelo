import { loadEnv, resetEnvCache } from './env';

/** A complete, valid production environment with real secrets. */
function prodBase(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'production',
    DATABASE_URL: 'postgres://user:pass@db.internal:5432/tavelo',
    JWT_ACCESS_SECRET: 'a-real-admin-access-secret-value',
    JWT_REFRESH_SECRET: 'a-real-admin-refresh-secret-value',
    OWNER_JWT_ACCESS_SECRET: 'a-real-owner-access-secret-value',
    OWNER_JWT_REFRESH_SECRET: 'a-real-owner-refresh-secret-value',
    STAFF_JWT_ACCESS_SECRET: 'a-real-staff-access-secret-value',
    STAFF_JWT_REFRESH_SECRET: 'a-real-staff-refresh-secret-value',
  } as NodeJS.ProcessEnv;
}

describe('env validation — production secret guard', () => {
  beforeEach(() => resetEnvCache());
  afterEach(() => resetEnvCache());

  it('accepts a production env whose owner/staff secrets are all real', () => {
    expect(() => loadEnv(prodBase())).not.toThrow();
  });

  it.each([
    ['OWNER_JWT_ACCESS_SECRET', 'owner-access-secret-change-me-32chars'],
    ['OWNER_JWT_REFRESH_SECRET', 'owner-refresh-secret-change-me-32chars'],
    ['STAFF_JWT_ACCESS_SECRET', 'staff-access-secret-change-me-32chars'],
    ['STAFF_JWT_REFRESH_SECRET', 'staff-refresh-secret-change-me-32chars'],
  ])('rejects production when %s is the built-in placeholder', (key, placeholder) => {
    const env = { ...prodBase(), [key]: placeholder };
    expect(() => loadEnv(env)).toThrow(/Environment validation failed/);
  });

  it('rejects production when the owner secrets are simply left unset (defaults apply)', () => {
    const env = prodBase();
    delete env.OWNER_JWT_ACCESS_SECRET;
    delete env.OWNER_JWT_REFRESH_SECRET;
    expect(() => loadEnv(env)).toThrow(/Environment validation failed/);
  });

  it('allows the placeholder defaults outside production (dev boots with zero config)', () => {
    const env = {
      NODE_ENV: 'development',
      DATABASE_URL: 'postgres://user:pass@db.internal:5432/tavelo',
      JWT_ACCESS_SECRET: 'a-real-admin-access-secret-value',
      JWT_REFRESH_SECRET: 'a-real-admin-refresh-secret-value',
    } as NodeJS.ProcessEnv;
    expect(() => loadEnv(env)).not.toThrow();
  });
});
