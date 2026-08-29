import { HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import {
  StaffPermissionsGuard,
  STAFF_PERMISSIONS_KEY,
} from '../staff-auth/staff-permissions.guard';
import { permissionsForRole, roleHasPermission } from '../staff-auth/role-permissions';
import { hotelStaffRoleValues } from '../../database/schema';
import type { AuthenticatedStaff } from '../staff-auth/current-staff.decorator';

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

function guardFor(required: string[]) {
  const reflector = {
    getAllAndOverride: (key: string) => (key === STAFF_PERMISSIONS_KEY ? required : undefined),
  } as unknown as Reflector;
  return new StaffPermissionsGuard(reflector);
}

const admits = (required: string[], role: string) => {
  try {
    return guardFor(required).canActivate(ctxFor(role)) === true;
  } catch {
    return false;
  }
};

/**
 * The rooms permission split, enforced by the real guard against the real role
 * map — the same pair the running server uses.
 */
describe('POST /staff/rooms/:id/status — room.status.update', () => {
  const STATUS = ['room.status.update'];

  it('admits the roles that actually turn rooms over', () => {
    for (const role of [
      'GENERAL_MANAGER',
      'ASSISTANT_GENERAL_MANAGER',
      'HOUSEKEEPING_SUPERVISOR',
      'ROOM_ATTENDANT',
      'RECEPTIONIST',
    ]) {
      expect({ role, allowed: admits(STATUS, role) }).toEqual({ role, allowed: true });
    }
  });

  // The headline negative: a role without the permission is refused by the
  // server, not merely hidden from in the app.
  it('REFUSES a role without room.status.update', () => {
    for (const role of ['CHEF', 'WAITER', 'SECURITY_STAFF', 'DRIVER', 'ACCOUNTS', 'HR']) {
      expect({ role, allowed: admits(STATUS, role) }).toEqual({ role, allowed: false });
    }
  });

  it('refuses a technician — they read the board but do not clear rooms', () => {
    expect(roleHasPermission('TECHNICIAN', 'room.read')).toBe(true);
    expect(admits(STATUS, 'TECHNICIAN')).toBe(false);
  });

  it('throws STAFF_FORBIDDEN naming the missing key', () => {
    try {
      guardFor(STATUS).canActivate(ctxFor('CHEF'));
      throw new Error('should have thrown');
    } catch (err) {
      expect(err).toBeInstanceOf(HttpException);
      const res = (err as HttpException).getResponse() as { error: string; message: string };
      expect(res.error).toBe('STAFF_FORBIDDEN');
      expect(res.message).toContain('room.status.update');
    }
  });
});

/**
 * Turning a room over and EDITING a room are different acts. Folding them into
 * one permission would hand a room attendant the ability to renumber a floor
 * or move a room onto a pricier type.
 */
describe('room.update stays narrower than room.status.update', () => {
  it('lets housekeeping and reception change status but NOT edit the room', () => {
    for (const role of ['HOUSEKEEPING_SUPERVISOR', 'ROOM_ATTENDANT', 'RECEPTIONIST']) {
      expect({ role, status: admits(['room.status.update'], role) }).toEqual({
        role,
        status: true,
      });
      expect({ role, edit: admits(['room.update'], role) }).toEqual({ role, edit: false });
      expect({ role, create: admits(['room.create'], role) }).toEqual({ role, create: false });
      expect({ role, del: admits(['room.delete'], role) }).toEqual({ role, del: false });
    }
  });

  it('gives full room CRUD to management only', () => {
    for (const perm of ['room.create', 'room.update', 'room.delete']) {
      const holders = hotelStaffRoleValues.filter((r) => roleHasPermission(r, perm));
      expect({ perm, holders }).toEqual({
        perm,
        holders: ['GENERAL_MANAGER', 'ASSISTANT_GENERAL_MANAGER'],
      });
    }
  });

  it('gives room type management to management only', () => {
    for (const perm of ['roomtype.read', 'roomtype.create', 'roomtype.update', 'roomtype.delete']) {
      const holders = hotelStaffRoleValues.filter((r) => roleHasPermission(r, perm));
      expect({ perm, holders }).toEqual({
        perm,
        holders: ['GENERAL_MANAGER', 'ASSISTANT_GENERAL_MANAGER'],
      });
    }
  });
});

describe('GET /staff/rooms — room.read', () => {
  it('admits every operational role that needs the board', () => {
    for (const role of [
      'GENERAL_MANAGER',
      'ASSISTANT_GENERAL_MANAGER',
      'RECEPTIONIST',
      'HOUSEKEEPING_SUPERVISOR',
      'ROOM_ATTENDANT',
      'TECHNICIAN',
    ]) {
      expect({ role, allowed: admits(['room.read'], role) }).toEqual({ role, allowed: true });
    }
  });

  it('keeps the rooms board away from roles with no business on it', () => {
    for (const role of ['CHEF', 'WAITER', 'CASHIER', 'SECURITY_STAFF', 'DRIVER', 'HR']) {
      expect({ role, allowed: admits(['room.read'], role) }).toEqual({ role, allowed: false });
    }
  });
});
