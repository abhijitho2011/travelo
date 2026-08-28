#!/usr/bin/env node
// Railway boot: run SQL migrations if any exist, then launch the app.
// Kept in pure Node (no tsx) so the runtime image needs no extra deps.

import { readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import pg from 'pg';

const MIGRATIONS_DIR = path.resolve('src/database/migrations');

async function runMigrations() {
  if (!existsSync(MIGRATIONS_DIR)) {
    console.log('[boot] no migrations directory; skipping');
    return;
  }
  const files = (await readdir(MIGRATIONS_DIR))
    .filter((f) => f.endsWith('.sql'))
    .sort();
  if (files.length === 0) {
    console.log('[boot] migrations directory is empty; skipping');
    return;
  }
  if (!process.env.DATABASE_URL) {
    console.warn('[boot] DATABASE_URL not set; skipping migrations');
    return;
  }
  const { Client } = pg;
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    const { readFile } = await import('node:fs/promises');
    for (const file of files) {
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      console.log(`[boot] applying migration: ${file}`);
      await client.query(sql);
    }
    console.log(`[boot] applied ${files.length} migration(s)`);
  } finally {
    await client.end();
  }
}

async function runSeedIfRequested() {
  if (process.env.RUN_SEED !== 'true') return;
  console.log('[boot] RUN_SEED=true — running seed');
  const { fileURLToPath } = await import('node:url');
  const here = path.dirname(fileURLToPath(import.meta.url));
  const seedPath = path.join(here, 'seed-node.mjs');
  const res = spawn(process.execPath, [seedPath], { stdio: 'inherit', env: process.env });
  await new Promise((resolve, reject) =>
    res.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`seed exit ${code}`)))),
  );
}

async function main() {
  try {
    await runMigrations();
    await runSeedIfRequested();
  } catch (err) {
    console.error('[boot] pre-start step failed:', err);
    process.exit(1);
  }
  const child = spawn(process.execPath, ['dist/main.js'], {
    stdio: 'inherit',
    env: process.env,
  });
  child.on('exit', (code) => process.exit(code ?? 0));
}

main();
