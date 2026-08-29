import { execFileSync } from 'node:child_process';

/**
 * Is there a container runtime we can actually talk to?
 *
 * This is deliberately a SYNCHRONOUS probe. Jest decides which tests exist
 * while a test file is being loaded, so the choice between `describe` and
 * `describe.skip` has to be made before any `beforeAll` could run. An async
 * probe would leave only two options — fail, or pass vacuously — and the
 * requirement is to SKIP with a clear message.
 *
 * This module deliberately touches nothing from Jest's global environment: it
 * is also imported by `global-setup.ts`, which runs before those globals exist.
 *
 * Set `TAVELO_E2E_SKIP_DOCKER=true` to force the skip, e.g. on a CI job that
 * has Docker but does not want to spend the minutes.
 */
let cached: boolean | undefined;

export function dockerAvailable(): boolean {
  if (cached !== undefined) return cached;
  if (process.env.TAVELO_E2E_SKIP_DOCKER === 'true') {
    cached = false;
    return cached;
  }
  try {
    execFileSync('docker', ['info'], { stdio: 'ignore', timeout: 15_000 });
    cached = true;
  } catch {
    cached = false;
  }
  return cached;
}
