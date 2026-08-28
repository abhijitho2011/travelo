import { Global, Module, OnModuleDestroy, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle, NodePgDatabase } from 'drizzle-orm/node-postgres';
import { Client, Pool, PoolConfig } from 'pg';
import * as schema from './schema';

export const DRIZZLE = Symbol('DRIZZLE');
export const PG_POOL = Symbol('PG_POOL');

export type Database = NodePgDatabase<typeof schema>;

interface Candidate {
  label: string;
  connectionString: string;
  ssl: boolean;
}

/**
 * Probe a connection string with a short-lived client. Mirrors the boot
 * script's connectFirst so the running app survives private-network
 * flakiness by falling back to the public URL.
 */
async function probe(c: Candidate): Promise<boolean> {
  const client = new Client({
    connectionString: c.connectionString,
    ssl: c.ssl ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 8000,
  });
  try {
    await client.connect();
    await client.query('SELECT 1');
    return true;
  } catch {
    return false;
  } finally {
    await client.end().catch(() => undefined);
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      inject: [ConfigService],
      useFactory: async (config: ConfigService) => {
        const logger = new Logger('PgPool');
        const privateUrl = config.getOrThrow<string>('DATABASE_URL');
        const publicUrl = config.get<string>('DATABASE_PUBLIC_URL');
        const privateSsl = config.get<string>('DATABASE_SSL') === 'true';

        const candidates: Candidate[] = [
          { label: 'DATABASE_URL', connectionString: privateUrl, ssl: privateSsl },
        ];
        // Public Railway proxy always requires SSL.
        if (publicUrl) {
          candidates.push({ label: 'DATABASE_PUBLIC_URL', connectionString: publicUrl, ssl: true });
        }

        // Pick the first reachable candidate; default to the private URL so the
        // app still boots (and /health/live serves) even if all probes fail.
        let chosen = candidates[0];
        for (const c of candidates) {
          // eslint-disable-next-line no-await-in-loop
          if (await probe(c)) {
            chosen = c;
            logger.log(`Using ${c.label} for the connection pool`);
            break;
          }
          logger.warn(`Database candidate ${c.label} unreachable; trying next`);
        }

        const poolConfig: PoolConfig = {
          connectionString: chosen.connectionString,
          ssl: chosen.ssl ? { rejectUnauthorized: false } : undefined,
          max: 10,
        };
        const pool = new Pool(poolConfig);
        pool.on('error', (err) => logger.error(err.message));
        return pool;
      },
    },
    {
      provide: DRIZZLE,
      inject: [PG_POOL],
      useFactory: (pool: Pool) => drizzle(pool, { schema }),
    },
  ],
  exports: [DRIZZLE, PG_POOL],
})
export class DatabaseModule implements OnModuleDestroy {
  constructor() {}
  async onModuleDestroy(): Promise<void> {
    // pool closed by process teardown
  }
}
