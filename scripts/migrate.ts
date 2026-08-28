/* Runs drizzle migrations from ./src/database/migrations against DATABASE_URL. */
import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import * as fs from 'node:fs';
import * as path from 'node:path';

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL not set — skipping migrations.');
    process.exit(0);
  }
  const ssl = process.env.DATABASE_SSL === 'true';
  const pool = new Pool({
    connectionString: url,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
  });

  // Ensure pgcrypto for gen_random_uuid().
  await pool.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');

  const db = drizzle(pool);
  const migrationsFolder = path.resolve(__dirname, '..', 'src', 'database', 'migrations');
  if (!fs.existsSync(migrationsFolder) || fs.readdirSync(migrationsFolder).length === 0) {
    console.warn(`No migrations found in ${migrationsFolder}. Run "npm run db:generate" first.`);
    await pool.end();
    return;
  }
  console.log(`Running migrations from ${migrationsFolder} ...`);
  await migrate(db, { migrationsFolder });
  console.log('Migrations complete.');
  await pool.end();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
