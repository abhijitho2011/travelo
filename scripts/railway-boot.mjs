#!/usr/bin/env node
// Railway boot: run SQL migrations if any exist, then launch the app.
// Kept in pure Node (no tsx) so the runtime image needs no extra deps.

import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';

const MIGRATIONS_DIR = path.resolve('src/database/migrations');

const log = (m) => {
  process.stdout.write(`[boot] ${m}\n`);
};

function pgConfig() {
  const url = process.env.DATABASE_URL;
  if (!url) return null;
  const ssl = process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined;
  return { connectionString: url, ssl };
}

async function runMigrations() {
  if (!existsSync(MIGRATIONS_DIR)) {
    log('no migrations directory; skipping');
    return;
  }
  const files = (await readdir(MIGRATIONS_DIR)).filter((f) => f.endsWith('.sql')).sort();
  if (files.length === 0) {
    log('migrations directory is empty; skipping');
    return;
  }
  const cfg = pgConfig();
  if (!cfg) {
    log('DATABASE_URL not set; skipping migrations');
    return;
  }
  log(`connecting to Postgres for ${files.length} migration file(s)`);
  const { Client } = pg;
  const client = new Client(cfg);
  await client.connect();
  log('connected');
  try {
    const { readFile } = await import('node:fs/promises');
    for (const file of files) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      log(`applying migration: ${file} (${sql.length} bytes)`);
      try {
        await client.query(sql);
        log(`migration OK: ${file}`);
      } catch (err) {
        log(`migration FAILED (${file}): ${err.message ?? err}`);
        throw err;
      }
    }
    log(`applied ${files.length} migration(s)`);
  } finally {
    await client.end();
  }
}

async function runSeedIfRequested() {
  if (process.env.RUN_SEED !== 'true') return;
  log('RUN_SEED=true — running seed');
  const { fileURLToPath } = await import('node:url');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const seedPath = path.join(here, 'seed-node.mjs');
  const res = spawn(process.execPath, [seedPath], { stdio: 'inherit', env: process.env });
  await new Promise((resolve, reject) =>
    res.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`seed exit ${code}`)))),
  );
}

async function main() {
  log('starting');
  try {
    await runMigrations();
    await runSeedIfRequested();
  } catch (err) {
    log(`pre-start step failed: ${err?.stack ?? err}`);
    process.exit(1);
  }
  log('launching dist/main.js');
  const child = spawn(process.execPath, ['dist/main.js'], {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

main().catch((err) => {
  log(`fatal: ${err?.stack ?? err}`);
  process.exit(1);
});
