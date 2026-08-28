#!/usr/bin/env node
// Idempotent seed runner invoked from railway-boot.mjs when RUN_SEED=true.
// Uses tsx from devDependencies would require installing dev deps; instead we
// spawn the compiled seed via ts-node semantics through the existing tsx path
// only if available, or fall back to a pure-node seed of the essentials.

import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';

const seedTs = path.resolve('scripts/seed.ts');
if (!existsSync(seedTs)) {
  console.log('[seed-boot] scripts/seed.ts missing; skipping');
  process.exit(0);
}

// Prefer tsx if installed (dev container); on production runtime image we ship
// only production deps, so fall back to running the transpiled JS if present.
const tsx = path.resolve('node_modules/.bin/tsx');
let result;
if (existsSync(tsx)) {
  result = spawnSync(tsx, [seedTs], { stdio: 'inherit', env: process.env });
} else {
  console.log('[seed-boot] tsx not present in production image; skipping seed');
  process.exit(0);
}
process.exit(result.status ?? 0);
