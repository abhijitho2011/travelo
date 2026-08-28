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

function pgConfigs() {
  const configs = [];
  const push = (url, label, sslDefault) => {
    if (!url) return;
    const ssl =
      process.env.DATABASE_SSL === 'true' || sslDefault
        ? { rejectUnauthorized: false }
        : undefined;
    configs.push({ label, connectionString: url, ssl, connectionTimeoutMillis: 8000 });
  };
  push(process.env.DATABASE_URL, 'DATABASE_URL', false);
  push(process.env.DATABASE_PUBLIC_URL, 'DATABASE_PUBLIC_URL', true);
  return configs;
}

async function connectFirst(configs) {
  let lastErr;
  for (const cfg of configs) {
    log(`trying ${cfg.label}`);
    try {
      const { Client } = pg;
      const client = new Client(cfg);
      await client.connect();
      log(`connected via ${cfg.label}`);
      return client;
    } catch (err) {
      log(`failed to connect via ${cfg.label}: ${err.message ?? err}`);
      lastErr = err;
    }
  }
  throw lastErr ?? new Error('no database URL available');
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
  const configs = pgConfigs();
  if (configs.length === 0) {
    log('no DATABASE_URL / DATABASE_PUBLIC_URL; skipping migrations');
    return;
  }
  log(`connecting to Postgres for ${files.length} migration file(s)`);
  const client = await connectFirst(configs);
  try {
    const { readFile } = await import('node:fs/promises');

    // A database provisioned before tracking existed already has these applied.
    await adoptPreexistingMigrations(client, files);

    // Track what has already run. Without this every migration re-executes on
    // each boot: harmless-looking for idempotent DDL, but it masks real errors
    // and would re-apply a destructive statement.
    await client.query(`
      CREATE TABLE IF NOT EXISTS _boot_migrations (
        filename    text PRIMARY KEY,
        applied_at  timestamptz NOT NULL DEFAULT now()
      )
    `);
    const { rows } = await client.query('SELECT filename FROM _boot_migrations');
    const applied = new Set(rows.map((r) => r.filename));

    let ran = 0;
    for (const file of files) {
      if (applied.has(file)) {
        log(`migration already applied, skipping: ${file}`);
        continue;
      }
      const sql = await readFile(path.join(MIGRATIONS_DIR, file), 'utf8');
      log(`applying migration: ${file} (${sql.length} bytes)`);
      try {
        // Each migration and its bookkeeping commit together, so a crash can
        // never leave a migration applied but unrecorded (or vice versa).
        await client.query('BEGIN');
        await client.query(sql);
        await client.query('INSERT INTO _boot_migrations (filename) VALUES ($1)', [file]);
        await client.query('COMMIT');
        ran += 1;
        log(`migration OK: ${file}`);
      } catch (err) {
        await client.query('ROLLBACK').catch(() => {});
        log(`migration FAILED (${file}): ${err.message ?? err}`);
        throw err;
      }
    }
    log(`applied ${ran} new migration(s), ${files.length - ran} already present`);
  } finally {
    await client.end();
  }
}

/**
 * Migrations that ran before `_boot_migrations` existed are already in the
 * database. Record them as applied so this boot does not try to re-run them.
 */
async function adoptPreexistingMigrations(client, files) {
  const { rows } = await client.query(
    "SELECT to_regclass('public._boot_migrations') IS NOT NULL AS present",
  );
  if (rows[0]?.present) return;
  const { rows: adminRows } = await client.query(
    "SELECT to_regclass('public.admins') IS NOT NULL AS present",
  );
  if (!adminRows[0]?.present) return; // fresh database — nothing to adopt
  log('adopting pre-existing migrations into the tracking table');
  await client.query(`
    CREATE TABLE IF NOT EXISTS _boot_migrations (
      filename    text PRIMARY KEY,
      applied_at  timestamptz NOT NULL DEFAULT now()
    )
  `);
  for (const file of files) {
    await client.query(
      'INSERT INTO _boot_migrations (filename) VALUES ($1) ON CONFLICT DO NOTHING',
      [file],
    );
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
    // Do NOT crash — let the app boot and serve /health/live so we can diagnose.
    log('continuing to app boot despite migration failure');
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
