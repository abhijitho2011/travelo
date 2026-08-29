import { dockerAvailable } from './docker';

/**
 * Runs once, before Jest loads any test file.
 *
 * The banner lives here rather than inside a spec because Jest suppresses
 * console output from a suite that is entirely skipped — which is exactly the
 * case we most need to explain. Writing to `process.stderr` from global setup
 * is outside Jest's console capture, so the message always appears.
 */
export default async function globalSetup(): Promise<void> {
  if (dockerAvailable()) {
    process.stderr.write('\n[tavelo-e2e] Docker detected — running the full end-to-end suite.\n\n');
    return;
  }
  process.stderr.write(
    [
      '',
      '  ────────────────────────────────────────────────────────────────────',
      '  Tavelo E2E suite SKIPPED: no reachable Docker daemon.',
      '',
      '  These tests apply src/database/migrations to a throwaway PostgreSQL',
      '  container (testcontainers) and drive the real API over HTTP. Start',
      '  Docker Desktop or colima and re-run:',
      '',
      '      npm run test:e2e',
      '',
      '  Skipping is the designed behaviour, not a failure — this command',
      '  exits 0. `npm test` never needs Docker at all.',
      '  ────────────────────────────────────────────────────────────────────',
      '',
      '',
    ].join('\n'),
  );
}
