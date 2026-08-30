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

describe('restaurant permission split, enforced by the real guard', () => {
  it('lets the roles that order and cook read the menu', () => {
    for (const role of ['RESTAURANT_MANAGER', 'WAITER', 'CHEF']) {
      expect({ role, allowed: admits(['menu.read'], role) }).toEqual({ role, allowed: true });
    }
    // The cashier settles bills off item SNAPSHOTS, not the live menu.
    expect(admits(['menu.read'], 'CASHIER')).toBe(false);
  });

  it('gives menu and table management to the manager only', () => {
    for (const perm of ['menu.manage', 'table.manage']) {
      const holders = hotelStaffRoleValues.filter((r) => roleHasPermission(r, perm));
      expect({ perm, holders }).toEqual({ perm, holders: ['RESTAURANT_MANAGER'] });
    }
  });

  it('lets waiters take orders; refuses the chef and cashier that', () => {
    expect(admits(['order.create'], 'WAITER')).toBe(true);
    expect(admits(['order.create'], 'CHEF')).toBe(false);
    expect(admits(['order.create'], 'CASHIER')).toBe(false);
  });

  it('lets the waiter request a bill but only the cashier/manager settle it', () => {
    expect(admits(['bill.generate'], 'WAITER')).toBe(true);
    expect(admits(['bill.settle'], 'WAITER')).toBe(false);
    for (const role of ['CASHIER', 'RESTAURANT_MANAGER']) {
      expect({ role, settle: admits(['bill.settle'], role) }).toEqual({ role, settle: true });
    }
  });

  it('gives the void (order.cancel) to the manager only', () => {
    const holders = hotelStaffRoleValues.filter((r) => roleHasPermission(r, 'order.void'));
    expect(holders).toEqual(['RESTAURANT_MANAGER']);
  });

  it('lets both kitchen and floor advance a KOT (role split handled in-service)', () => {
    for (const role of ['CHEF', 'WAITER', 'RESTAURANT_MANAGER']) {
      expect({ role, allowed: admits(['kot.update'], role) }).toEqual({ role, allowed: true });
    }
  });

  // The headline invariant for the kitchen: a chef never sees the money.
  it('keeps CHEF and WAITER clear of the finance/revenue/payment namespaces', () => {
    const SENSITIVE = /^(finance|revenue|payroll|payment|procurement|owner)\./;
    for (const role of ['CHEF', 'WAITER']) {
      expect(permissionsForRole(role).filter((p) => SENSITIVE.test(p))).toEqual([]);
    }
  });

  it('never grants the chef a table or bill write', () => {
    for (const perm of ['table.manage', 'bill.generate', 'bill.settle', 'order.create']) {
      expect({ perm, chef: admits([perm], 'CHEF') }).toEqual({ perm, chef: false });
    }
  });
});
