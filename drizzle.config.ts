import type { Config } from 'drizzle-kit';

export default {
  schema: './src/database/schema/index.ts',
  out: './src/database/migrations',
  dialect: 'postgresql',
  dbCredentials: {
    url:
      process.env.DATABASE_URL ??
      (() => {
        throw new Error('DATABASE_URL must be set (no hardcoded fallback in Railway-ready config)');
      })(),
  },
  strict: true,
  verbose: true,
} satisfies Config;
