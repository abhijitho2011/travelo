import { RequestMethod } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Reflector } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DRIZZLE } from '../../database/database.module';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from '../permissions/permissions.service';
import { StaffJwtGuard } from '../staff-auth/staff-jwt.guard';
import {
  StaffPermissionsGuard,
  STAFF_PERMISSIONS_KEY,
} from '../staff-auth/staff-permissions.guard';
import { permissionsForRole } from '../staff-auth/role-permissions';
import type { AuthenticatedStaff } from '../staff-auth/current-staff.decorator';
import {
  StaffDashboardController,
  StaffDeskController,
  StaffReservationsController,
} from './staff-reservations.controller';
import { DeskService } from './desk.service';
import { ReservationsService } from './reservations.service';
import { FolioReceiptService } from '../folio/folio-receipt.service';

/**
 * The reservations surface: where its URLs land, and who the real guard lets
 * through to them.
 */

// ---------- Route mounting ----------

/**
 * Staff routes are EXCLUDED from the /api/v1/admin global prefix (see main.ts)
 * and live at their literal paths. Getting that wrong ships
 * /api/v1/admin/api/v1/staff/reservations, which 404s for every client.
 */
describe('reservations surface route mounting', () => {
  let routes: { method: string; path: string }[];
  const has = (method: string, path: string) =>
    routes.some((r) => r.method === method && r.path === path);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [StaffReservationsController, StaffDeskController, StaffDashboardController],
      providers: [
        StaffJwtGuard,
        StaffPermissionsGuard,
        { provide: ReservationsService, useValue: {} },
        { provide: DeskService, useValue: {} },
        { provide: FolioReceiptService, useValue: {} },
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
    routes = (router.stack ?? [])
      .filter((l) => l.route)
      .map((l) => ({
        method: Object.keys(l.route!.methods)[0].toUpperCase(),
        path: l.route!.path,
      }));
    await app.close();
  });

  it('mounts the reservation URLs at their literal staff paths', () => {
    expect(has('GET', '/api/v1/staff/reservations')).toBe(true);
    expect(has('POST', '/api/v1/staff/reservations')).toBe(true);
    expect(has('GET', '/api/v1/staff/reservations/:id')).toBe(true);
    expect(has('PATCH', '/api/v1/staff/reservations/:id')).toBe(true);
  });

  it('mounts every transition route', () => {
    for (const action of ['confirm', 'assign-room', 'check-in', 'check-out', 'cancel', 'no-show']) {
      expect({ action, mounted: has('POST', `/api/v1/staff/reservations/:id/${action}`) }).toEqual({
        action,
        mounted: true,
      });
    }
  });

  it('mounts the one-call desk board and GM dashboard', () => {
    expect(has('GET', '/api/v1/staff/desk/today')).toBe(true);
    expect(has('GET', '/api/v1/staff/dashboard')).toBe(true);
  });

  // Express matches in declaration order, so "availability" must be registered
  // before ":id" or every availability call reads as a reservation with that id.
  it('declares /reservations/availability BEFORE /reservations/:id', () => {
    const availability = routes.findIndex(
      (r) => r.method === 'GET' && r.path === '/api/v1/staff/reservations/availability',
    );
    const byId = routes.findIndex(
      (r) => r.method === 'GET' && r.path === '/api/v1/staff/reservations/:id',
    );
    expect(availability).toBeGreaterThanOrEqual(0);
    expect(availability).toBeLessThan(byId);
  });

  it('never double-prefixes a staff route under /api/v1/admin', () => {
    expect(routes.filter((r) => r.path.startsWith('/api/v1/admin/api/v1/'))).toEqual([]);
  });
});

// ---------- Permissions ----------

function ctxFor(role: string) {
  const staff: Partial<AuthenticatedStaff> = {
    id: 'me',
    role,
    permissions: permissionsForRole(role),
  };
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ staff }) }),
  } as never;
}

function admits(required: string[], role: string): boolean {
  const reflector = {
    getAllAndOverride: (key: string) => (key === STAFF_PERMISSIONS_KEY ? required : undefined),
  } as unknown as Reflector;
  try {
    return new StaffPermissionsGuard(reflector).canActivate(ctxFor(role)) === true;
  } catch {
    return false;
  }
}

describe('who may act on a reservation', () => {
  it('lets the desk and management take a booking', () => {
    for (const role of [
      'RECEPTIONIST',
      'GENERAL_MANAGER',
      'ASSISTANT_GENERAL_MANAGER',
      'SALES_MANAGER',
    ]) {
      expect({ role, allowed: admits(['reservation.create'], role) }).toEqual({
        role,
        allowed: true,
      });
    }
  });

  it('refuses roles that have no business raising a booking', () => {
    for (const role of ['CHEF', 'WAITER', 'ROOM_ATTENDANT', 'DRIVER', 'HR', 'SECURITY_STAFF']) {
      expect({ role, allowed: admits(['reservation.create'], role) }).toEqual({
        role,
        allowed: false,
      });
    }
  });

  /**
   * Cancelling is the one front-office act that destroys revenue, so it is a
   * permission of its own. Sales and the travel desk can RAISE bookings and
   * deliberately cannot cancel them.
   */
  it('restricts cancellation to reception and management', () => {
    for (const role of ['RECEPTIONIST', 'GENERAL_MANAGER', 'ASSISTANT_GENERAL_MANAGER']) {
      expect({ role, allowed: admits(['reservation.cancel'], role) }).toEqual({
        role,
        allowed: true,
      });
    }
    for (const role of ['SALES_MANAGER', 'TRAVEL_DESK', 'ACCOUNTS']) {
      expect({ role, allowed: admits(['reservation.cancel'], role) }).toEqual({
        role,
        allowed: false,
      });
    }
  });

  // Admitting a guest is `checkin.perform`, NOT `reservation.update`: a duty
  // receptionist checks people in without being able to rewrite the booking.
  it('gates check-in and check-out on their own permissions', () => {
    expect(admits(['checkin.perform'], 'RECEPTIONIST')).toBe(true);
    expect(admits(['checkout.perform'], 'RECEPTIONIST')).toBe(true);
    expect(admits(['checkin.perform'], 'SALES_MANAGER')).toBe(false);
    expect(admits(['checkin.perform'], 'ACCOUNTS')).toBe(false);
  });

  it('keeps occupancy and month revenue off the floor staff’s dashboard', () => {
    expect(admits(['dashboard.read'], 'GENERAL_MANAGER')).toBe(true);
    expect(admits(['dashboard.read'], 'ASSISTANT_GENERAL_MANAGER')).toBe(true);
    for (const role of ['RECEPTIONIST', 'ROOM_ATTENDANT', 'CHEF', 'HR']) {
      expect({ role, allowed: admits(['dashboard.read'], role) }).toEqual({
        role,
        allowed: false,
      });
    }
  });
});
