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
import { StaffHousekeepingController } from './housekeeping.controller';
import { StaffWorkOrdersController } from './work-orders.controller';
import { HousekeepingService } from './housekeeping.service';
import { WorkOrdersService } from './work-orders.service';

// ---------- Route mounting ----------

describe('housekeeping surface route mounting', () => {
  let routes: { method: string; path: string }[];
  const has = (method: string, path: string) =>
    routes.some((r) => r.method === method && r.path === path);

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [StaffHousekeepingController, StaffWorkOrdersController],
      providers: [
        StaffJwtGuard,
        StaffPermissionsGuard,
        { provide: HousekeepingService, useValue: {} },
        { provide: WorkOrdersService, useValue: {} },
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

  it('mounts the housekeeping task URLs at their literal staff paths', () => {
    expect(has('GET', '/api/v1/staff/housekeeping/tasks')).toBe(true);
    expect(has('POST', '/api/v1/staff/housekeeping/tasks')).toBe(true);
    expect(has('GET', '/api/v1/staff/housekeeping/tasks/:id')).toBe(true);
    expect(has('GET', '/api/v1/staff/housekeeping/board')).toBe(true);
    expect(has('GET', '/api/v1/staff/housekeeping/my-tasks')).toBe(true);
  });

  it('mounts every task action route', () => {
    for (const action of ['assign', 'start', 'complete', 'inspect']) {
      expect({
        action,
        mounted: has('POST', `/api/v1/staff/housekeeping/tasks/:id/${action}`),
      }).toEqual({
        action,
        mounted: true,
      });
    }
  });

  it('mounts the work-order URLs and lifecycle actions', () => {
    expect(has('GET', '/api/v1/staff/work-orders')).toBe(true);
    expect(has('POST', '/api/v1/staff/work-orders')).toBe(true);
    expect(has('GET', '/api/v1/staff/work-orders/:id')).toBe(true);
    expect(has('GET', '/api/v1/staff/work-orders/mine')).toBe(true);
    for (const action of ['accept', 'start', 'pause', 'resume', 'complete', 'cancel']) {
      expect({ action, mounted: has('POST', `/api/v1/staff/work-orders/:id/${action}`) }).toEqual({
        action,
        mounted: true,
      });
    }
  });

  it('declares fixed segments (board, my-tasks) not as :id captures', () => {
    // These live under /housekeeping and /work-orders, distinct prefixes from
    // the :id routes, so ordering is not a hazard — but they must exist as
    // literal paths, not be swallowed.
    expect(has('GET', '/api/v1/staff/work-orders/mine')).toBe(true);
    expect(has('GET', '/api/v1/staff/housekeeping/board')).toBe(true);
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

describe('who may act on housekeeping tasks', () => {
  it('lets the attendant, cleaner and cleaning staff read and work their tasks', () => {
    for (const role of ['ROOM_ATTENDANT', 'CLEANING_STAFF', 'CLEANER']) {
      expect({ role, ok: admits(['task.read'], role) }).toEqual({ role, ok: true });
      expect({ role, ok: admits(['task.start'], role) }).toEqual({ role, ok: true });
      expect({ role, ok: admits(['task.complete'], role) }).toEqual({ role, ok: true });
    }
  });

  it('reserves assign and inspect for supervisors and management', () => {
    for (const role of [
      'HOUSEKEEPING_SUPERVISOR',
      'GENERAL_MANAGER',
      'ASSISTANT_GENERAL_MANAGER',
    ]) {
      expect({ role, ok: admits(['task.assign'], role) }).toEqual({ role, ok: true });
      expect({ role, ok: admits(['task.inspect'], role) }).toEqual({ role, ok: true });
    }
    for (const role of ['ROOM_ATTENDANT', 'CLEANING_STAFF', 'CLEANER']) {
      expect({ role, ok: admits(['task.assign'], role) }).toEqual({ role, ok: false });
      expect({ role, ok: admits(['task.inspect'], role) }).toEqual({ role, ok: false });
    }
  });

  it('gates the room board on housekeeping.read', () => {
    expect(admits(['housekeeping.read'], 'HOUSEKEEPING_SUPERVISOR')).toBe(true);
    expect(admits(['housekeeping.read'], 'GENERAL_MANAGER')).toBe(true);
    expect(admits(['housekeeping.read'], 'ROOM_ATTENDANT')).toBe(false);
  });
});

describe('who may act on work orders', () => {
  it('lets attendants, cleaners and reception REPORT a fault', () => {
    for (const role of [
      'ROOM_ATTENDANT',
      'CLEANING_STAFF',
      'CLEANER',
      'RECEPTIONIST',
      'TECHNICIAN',
    ]) {
      expect({ role, ok: admits(['maintenance.report'], role) }).toEqual({ role, ok: true });
    }
  });

  it('gives the technician the accept/start/pause/resume/complete lifecycle', () => {
    for (const p of [
      'workorder.read',
      'workorder.accept',
      'workorder.start',
      'workorder.pause',
      'workorder.resume',
      'workorder.complete',
    ]) {
      expect({ p, ok: admits([p], 'TECHNICIAN') }).toEqual({ p, ok: true });
    }
  });

  it('withholds the technician lifecycle from a cleaner who can only report', () => {
    for (const p of ['workorder.accept', 'workorder.complete', 'workorder.cancel']) {
      expect({ p, ok: admits([p], 'CLEANER') }).toEqual({ p, ok: false });
    }
  });

  it('reserves cancellation for the supervisor and management, not the technician', () => {
    expect(admits(['workorder.cancel'], 'HOUSEKEEPING_SUPERVISOR')).toBe(true);
    expect(admits(['workorder.cancel'], 'GENERAL_MANAGER')).toBe(true);
    expect(admits(['workorder.cancel'], 'TECHNICIAN')).toBe(false);
  });
});
