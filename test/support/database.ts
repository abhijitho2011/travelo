import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import { Client } from 'pg';
import { PostgreSqlContainer, StartedPostgreSqlContainer } from '@testcontainers/postgresql';

const MIGRATIONS_DIR = path.resolve(__dirname, '../../src/database/migrations');

export interface TestDatabase {
  /**
   * The container's OWN dynamically-allocated host and port. This is the only
   * localhost reference in the test suite, and it is not a hard-coded one —
   * testcontainers picks a free port per run so several suites (or several
   * developers) never collide.
   */
  url: string;
  container: StartedPostgreSqlContainer;
  client: Client;
  stop(): Promise<void>;
}

/**
 * Applies `src/database/migrations` in filename order, exactly as
 * `scripts/railway-boot.mjs` does in production:
 *
 *   - `.sql` files only, sorted by filename;
 *   - a `_boot_migrations` tracking table, so re-running is a no-op;
 *   - each migration and its bookkeeping row committed TOGETHER, so a failure
 *     can never leave a migration applied but unrecorded.
 *
 * Using the production path rather than `drizzle-kit push` is the point: it
 * means these tests exercise the schema the deployed application will actually
 * have, migration bugs included.
 */
export async function applyMigrations(client: Client): Promise<string[]> {
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();

  await client.query(`
    CREATE TABLE IF NOT EXISTS _boot_migrations (
      filename    text PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
  const { rows } = await client.query<{ filename: string }>(
    'SELECT filename FROM _boot_migrations',
  );
  const applied = new Set(rows.map((r) => r.filename));

  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO _boot_migrations (filename) VALUES ($1)', [file]);
      await client.query('COMMIT');
      ran.push(file);
    } catch (err) {
      await client.query('ROLLBACK').catch(() => undefined);
      throw new Error(`migration failed (${file}): ${(err as Error).message}`);
    }
  }
  return ran;
}

/**
 * Boots a throwaway PostgreSQL and brings it up to the current schema.
 *
 * Pulling the image the first time can take a while, hence the generous
 * timeouts callers pass to `beforeAll`.
 */
export async function startTestDatabase(): Promise<TestDatabase> {
  const container = await new PostgreSqlContainer('postgres:16-alpine')
    .withDatabase('tavelo_e2e')
    .withUsername('tavelo')
    .withPassword('tavelo')
    .start();

  const url = container.getConnectionUri();
  const client = new Client({ connectionString: url });
  await client.connect();
  await applyMigrations(client);

  return {
    url,
    container,
    client,
    async stop() {
      await client.end().catch(() => undefined);
      await container.stop();
    },
  };
}
