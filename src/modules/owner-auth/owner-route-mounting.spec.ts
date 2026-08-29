import { RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { DRIZZLE } from '../../database/database.module';
import { AuditService } from '../audit/audit.service';
import { EntitlementsService } from '../entitlements/entitlements.service';
import { OwnerAccountController } from './owner-account.controller';
import { OwnerSubscriptionController } from './owner-subscription.controller';
import { OwnerSupportController } from './owner-support.controller';
import { OwnerPortalController } from './owner-portal.controller';
import { OwnerProfileService } from './owner-profile.service';
import { OwnerSessionsService } from './owner-sessions.service';
import { OwnerSubscriptionService } from './owner-subscription.service';
import { OwnerSupportService } from './owner-support.service';
import { OwnerPortalService } from './owner-portal.service';
import { LocationsService } from './locations.service';
import { PropertyPhotosService } from './property-photos.service';
import { OwnerJwtGuard } from './owner-jwt.guard';

/**
 * Boots the REAL owner controllers and the REAL services behind them, under the
 * same global-prefix configuration `main.ts` applies.
 *
 * Two failures this catches before a deploy does:
 *   1. a service that is instantiable only because a provider was registered —
 *      a missing constructor dependency fails compilation of this module;
 *   2. a path typo or a missed prefix exclusion, which would serve 404 where the
 *      app expects 401.
 */
describe('owner surface route mounting', () => {
  async function mountedPaths(): Promise<{ method: string; path: string }[]> {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        OwnerPortalController,
        OwnerAccountController,
        OwnerSubscriptionController,
        OwnerSupportController,
      ],
      providers: [
        // Real services — this is the dependency-injection check.
        OwnerProfileService,
        OwnerSessionsService,
        OwnerSubscriptionService,
        OwnerSupportService,
        OwnerPortalService,
        LocationsService,
        OwnerJwtGuard,
        // Leaf collaborators that would otherwise reach a database, a bucket
        // or an environment.
        { provide: PropertyPhotosService, useValue: {} },
        { provide: AuditService, useValue: { record: async () => undefined } },
        { provide: EntitlementsService, useValue: { resolve: async () => ({ effective: [] }) } },
        { provide: JwtService, useValue: {} },
        { provide: ConfigService, useValue: { get: () => undefined, getOrThrow: () => 'x' } },
        { provide: DRIZZLE, useValue: {} },
      ],
    }).compile();

    const app = moduleRef.createNestApplication();
    app.setGlobalPrefix('/api/v1/admin', {
      exclude: [
        { path: 'api/v1/owner/(.*)', method: RequestMethod.ALL },
        { path: 'api/v1/staff/(.*)', method: RequestMethod.ALL },
      ],
    });
    await app.init();

    const router = (
      app.getHttpAdapter().getInstance() as {
        _router: { stack: { route?: { path: string; methods: Record<string, boolean> } }[] };
      }
    )._router;
    const found = (router.stack ?? [])
      .filter((l) => l.route)
      .map((l) => ({
        method: Object.keys(l.route!.methods)[0].toUpperCase(),
        path: l.route!.path,
      }));
    await app.close();
    return found;
  }

  let routes: { method: string; path: string }[];
  beforeAll(async () => {
    routes = await mountedPaths();
  });

  const has = (method: string, path: string) =>
    routes.some((r) => r.method === method && r.path === path);

  it('mounts the owner surface at its literal paths, outside the admin prefix', () => {
    // Nothing on this surface may pick up /api/v1/admin.
    for (const r of routes) {
      expect(r.path.startsWith('/api/v1/owner')).toBe(true);
    }
  });

  it('exposes the staff edit endpoint', () => {
    expect(has('PATCH', '/api/v1/owner/properties/:id/staff/:sid')).toBe(true);
  });

  it('exposes the profile endpoints', () => {
    expect(has('GET', '/api/v1/owner/profile')).toBe(true);
    expect(has('PATCH', '/api/v1/owner/profile')).toBe(true);
  });

  it('exposes the subscription endpoints', () => {
    expect(has('GET', '/api/v1/owner/subscription')).toBe(true);
    expect(has('GET', '/api/v1/owner/subscription/invoices')).toBe(true);
  });

  it('exposes the support endpoints', () => {
    expect(has('GET', '/api/v1/owner/support/tickets')).toBe(true);
    expect(has('POST', '/api/v1/owner/support/tickets')).toBe(true);
    expect(has('GET', '/api/v1/owner/support/tickets/:id')).toBe(true);
    expect(has('POST', '/api/v1/owner/support/tickets/:id/messages')).toBe(true);
  });

  it('exposes the session endpoints', () => {
    expect(has('GET', '/api/v1/owner/sessions')).toBe(true);
    expect(has('POST', '/api/v1/owner/sessions/revoke-all')).toBe(true);
    expect(has('DELETE', '/api/v1/owner/sessions/:id')).toBe(true);
  });

  it('matches revoke-all as a literal path, not as a session id', () => {
    const paths = routes.filter((r) => r.path.startsWith('/api/v1/owner/sessions'));
    const revokeAll = paths.findIndex((r) => r.path.endsWith('revoke-all'));
    const byId = paths.findIndex((r) => r.path.endsWith(':id'));
    expect(revokeAll).toBeGreaterThanOrEqual(0);
    expect(byId).toBeGreaterThan(revokeAll);
  });
});
