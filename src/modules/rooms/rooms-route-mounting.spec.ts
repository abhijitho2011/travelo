import { RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Test } from '@nestjs/testing';
import { DRIZZLE } from '../../database/database.module';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from '../permissions/permissions.service';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import { StaffPermissionsGuard } from '../staff-auth/staff-permissions.guard';
import { OwnerJwtGuard } from '../owner-auth/owner-jwt.guard';
import { AdminAmenitiesController } from './admin-amenities.controller';
import {
  StaffAmenitiesController,
  StaffRoomTypesController,
  StaffRoomsController,
} from './staff-rooms.controller';
import { OwnerRoomsController } from './owner-rooms.controller';
import { AmenitiesService } from './amenities.service';
import { RoomTypesService } from './room-types.service';
import { RoomTypePhotosService } from './room-type-photos.service';
import { RoomPhotosService } from './room-photos.service';
import { RoomsService } from './rooms.service';
import { OwnerRoomsService } from './owner-rooms.service';

/**
 * The three surfaces sit at three different prefixes: the admin catalogue
 * inherits the /api/v1/admin global prefix, while the staff and owner routes
 * are EXCLUDED from it and live at their literal paths (see main.ts).
 *
 * Getting that wrong ships /api/v1/admin/api/v1/staff/rooms, which 404s for
 * every client. This boots the REAL controllers behind the REAL prefix config
 * and asserts the resulting URLs.
 */
describe('rooms surface route mounting', () => {
  async function mountedPaths(): Promise<{ method: string; path: string }[]> {
    const moduleRef = await Test.createTestingModule({
      controllers: [
        AdminAmenitiesController,
        StaffRoomTypesController,
        StaffRoomsController,
        StaffAmenitiesController,
        OwnerRoomsController,
      ],
      providers: [
        StaffJwtGuard,
        StaffPermissionsGuard,
        OwnerJwtGuard,
        { provide: AmenitiesService, useValue: {} },
        { provide: RoomTypesService, useValue: {} },
        { provide: RoomTypePhotosService, useValue: {} },
        { provide: RoomPhotosService, useValue: {} },
        { provide: RoomsService, useValue: {} },
        { provide: OwnerRoomsService, useValue: {} },
        { provide: AuditService, useValue: { record: async () => undefined } },
        { provide: PermissionsService, useValue: {} },
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
  const has = (method: string, path: string) =>
    routes.some((r) => r.method === method && r.path === path);

  beforeAll(async () => {
    routes = await mountedPaths();
  });

  it('mounts the admin amenity catalogue under the admin prefix', () => {
    expect(has('GET', '/api/v1/admin/settings/amenities')).toBe(true);
    expect(has('POST', '/api/v1/admin/settings/amenities')).toBe(true);
    expect(has('PATCH', '/api/v1/admin/settings/amenities/:id')).toBe(true);
    expect(has('DELETE', '/api/v1/admin/settings/amenities/:id')).toBe(true);
  });

  it('mounts the staff room-type URLs at their literal paths', () => {
    expect(has('GET', '/api/v1/staff/room-types')).toBe(true);
    expect(has('POST', '/api/v1/staff/room-types')).toBe(true);
    expect(has('GET', '/api/v1/staff/room-types/:id')).toBe(true);
    expect(has('PATCH', '/api/v1/staff/room-types/:id')).toBe(true);
    expect(has('DELETE', '/api/v1/staff/room-types/:id')).toBe(true);
  });

  it('mounts the room-type photo URLs under the same literal prefix', () => {
    expect(has('GET', '/api/v1/staff/room-types/:id/photos')).toBe(true);
    expect(has('POST', '/api/v1/staff/room-types/:id/photos')).toBe(true);
    expect(has('PATCH', '/api/v1/staff/room-types/:id/photos/order')).toBe(true);
    expect(has('POST', '/api/v1/staff/room-types/:id/photos/:photoId/primary')).toBe(true);
    expect(has('DELETE', '/api/v1/staff/room-types/:id/photos/:photoId')).toBe(true);
  });

  // "order" must be registered before anything that would read it as an id.
  it('declares /photos/order BEFORE any /photos/:photoId route', () => {
    const order = routes.findIndex(
      (r) => r.method === 'PATCH' && r.path === '/api/v1/staff/room-types/:id/photos/order',
    );
    const byId = routes.findIndex((r) => r.path.includes('/photos/:photoId'));
    expect(order).toBeGreaterThanOrEqual(0);
    expect(order).toBeLessThan(byId);
  });

  it('mounts the staff room URLs, including bulk and the narrow status route', () => {
    expect(has('GET', '/api/v1/staff/rooms')).toBe(true);
    expect(has('POST', '/api/v1/staff/rooms')).toBe(true);
    expect(has('POST', '/api/v1/staff/rooms/bulk')).toBe(true);
    expect(has('GET', '/api/v1/staff/rooms/:id')).toBe(true);
    expect(has('PATCH', '/api/v1/staff/rooms/:id')).toBe(true);
    expect(has('POST', '/api/v1/staff/rooms/:id/status')).toBe(true);
    expect(has('DELETE', '/api/v1/staff/rooms/:id')).toBe(true);
  });

  // Express matches in declaration order, so "bulk" must be registered before
  // ":id" or every bulk create would be read as a room with the id "bulk".
  it('declares /rooms/bulk BEFORE /rooms/:id', () => {
    const bulk = routes.findIndex(
      (r) => r.method === 'POST' && r.path === '/api/v1/staff/rooms/bulk',
    );
    const byId = routes.findIndex(
      (r) => r.method === 'GET' && r.path === '/api/v1/staff/rooms/:id',
    );
    expect(bulk).toBeGreaterThanOrEqual(0);
    expect(bulk).toBeLessThan(byId);
  });

  it('mounts the staff amenity picker feed', () => {
    expect(has('GET', '/api/v1/staff/amenities')).toBe(true);
  });

  it('mounts the owner read + amenity-write URLs', () => {
    expect(has('GET', '/api/v1/owner/properties/:id/amenities')).toBe(true);
    expect(has('PUT', '/api/v1/owner/properties/:id/amenities')).toBe(true);
    expect(has('GET', '/api/v1/owner/properties/:id/room-types')).toBe(true);
    expect(has('GET', '/api/v1/owner/properties/:id/rooms')).toBe(true);
  });

  // Owners do not create rooms — that is operational, and the absence of the
  // route is what guarantees it, not a check inside a handler.
  it('exposes NO owner write route for rooms or room types', () => {
    const ownerWrites = routes.filter(
      (r) =>
        r.path.startsWith('/api/v1/owner/') && r.method !== 'GET' && !r.path.endsWith('/amenities'),
    );
    expect(ownerWrites).toEqual([]);
  });

  it('never double-prefixes a staff or owner route under /api/v1/admin', () => {
    const doubled = routes.filter((r) => r.path.startsWith('/api/v1/admin/api/v1/'));
    expect(doubled).toEqual([]);
  });
});
