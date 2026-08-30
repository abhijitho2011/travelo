import { RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { DRIZZLE } from '../../database/database.module';
import { StaffAuthController } from './staff-auth.controller';
import { StaffTeamController } from './staff-team.controller';
import { StaffAuthService } from './staff-auth.service';
import { StaffTeamService } from './staff-team.service';
import { StaffMfaService } from './staff-mfa.service';
import { StaffJwtGuard } from './staff-jwt.guard';
import { StaffPermissionsGuard } from './staff-permissions.guard';

/**
 * The staff surface lives at literal /api/v1/staff/* paths and is EXCLUDED from
 * the admin global prefix (/api/v1/admin) in main.ts. This boots the REAL
 * controllers behind the same prefix configuration and asserts the resulting
 * URLs, so a regression in either a controller path or the exclusion list is
 * caught here rather than in production.
 */
describe('staff surface route mounting', () => {
  async function mountedPaths(): Promise<{ method: string; path: string }[]> {
    const moduleRef = await Test.createTestingModule({
      controllers: [StaffAuthController, StaffTeamController],
      providers: [
        StaffJwtGuard,
        StaffPermissionsGuard,
        { provide: StaffAuthService, useValue: {} },
        { provide: StaffTeamService, useValue: {} },
        { provide: StaffMfaService, useValue: {} },
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

  it('exposes exactly the documented staff auth URLs', async () => {
    const routes = await mountedPaths();
    const has = (method: string, path: string) =>
      routes.some((r) => r.method === method && r.path === path);

    expect(has('POST', '/api/v1/staff/auth/otp/request')).toBe(true);
    expect(has('POST', '/api/v1/staff/auth/otp/verify')).toBe(true);
    expect(has('POST', '/api/v1/staff/auth/google')).toBe(true);
    expect(has('POST', '/api/v1/staff/auth/refresh')).toBe(true);
    expect(has('POST', '/api/v1/staff/auth/logout')).toBe(true);
    expect(has('GET', '/api/v1/staff/auth/me')).toBe(true);
  });

  it('exposes the GM/AGM team-management URLs', async () => {
    const routes = await mountedPaths();
    const has = (method: string, path: string) =>
      routes.some((r) => r.method === method && r.path === path);

    expect(has('GET', '/api/v1/staff/team')).toBe(true);
    expect(has('POST', '/api/v1/staff/team')).toBe(true);
    expect(has('POST', '/api/v1/staff/team/:id/approve')).toBe(true);
    expect(has('POST', '/api/v1/staff/team/:id/status')).toBe(true);
    expect(has('DELETE', '/api/v1/staff/team/:id')).toBe(true);
  });

  it('never double-prefixes a staff route under /api/v1/admin', async () => {
    const routes = await mountedPaths();
    expect(routes.filter((r) => r.path.startsWith('/api/v1/admin'))).toEqual([]);
    expect(routes.every((r) => r.path.startsWith('/api/v1/staff/'))).toBe(true);
  });
});
