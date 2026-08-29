import { hotelStaffRoleValues } from '../../database/schema';
import { STAFF_ROLE_PERMISSIONS, permissionsForRole, roleHasPermission } from './role-permissions';

/** Money, ownership and people-cost namespaces that operational roles must never see. */
const SENSITIVE = /^(finance|revenue|payroll|payment|procurement|owner)\./;

describe('staff role → permission map', () => {
  it('covers all 24 roles with a non-empty list', () => {
    expect(hotelStaffRoleValues).toHaveLength(24);
    for (const role of hotelStaffRoleValues) {
      const perms = STAFF_ROLE_PERMISSIONS[role];
      expect(Array.isArray(perms)).toBe(true);
      expect(perms.length).toBeGreaterThan(0);
    }
  });

  it('maps exactly the declared roles — no extras, none missing', () => {
    expect(Object.keys(STAFF_ROLE_PERMISSIONS).sort()).toEqual([...hotelStaffRoleValues].sort());
  });

  it('uses dot-namespaced lower-case keys everywhere, with no duplicates', () => {
    for (const role of hotelStaffRoleValues) {
      const perms = permissionsForRole(role);
      for (const p of perms) {
        expect(p).toMatch(/^[a-z]+(\.[a-z]+)+$/);
      }
      expect(new Set(perms).size).toBe(perms.length);
    }
  });

  // The headline negative: a guard on the gate must never be able to see money.
  it('SECURITY_STAFF holds nothing financial, payroll, procurement or owner-related', () => {
    const perms = permissionsForRole('SECURITY_STAFF');
    expect(perms.length).toBeGreaterThan(0);
    expect(perms.filter((p) => SENSITIVE.test(p))).toEqual([]);
  });

  it('no security, housekeeping, kitchen, cleaning or driving role sees sensitive namespaces', () => {
    const operational = [
      'SECURITY_STAFF',
      'SECURITY_MANAGER',
      'HOUSEKEEPING_SUPERVISOR',
      'ROOM_ATTENDANT',
      'CLEANING_STAFF',
      'CLEANER',
      'CHEF',
      'WAITER',
      'TECHNICIAN',
      'DRIVER',
      'SPA_STAFF',
    ];
    for (const role of operational) {
      expect({ role, leaks: permissionsForRole(role).filter((p) => SENSITIVE.test(p)) }).toEqual({
        role,
        leaks: [],
      });
    }
  });

  it('gives the GM the broad management set', () => {
    for (const p of [
      'approval.read',
      'approval.act',
      'finance.read',
      'staff.read',
      'reports.read',
    ]) {
      expect(roleHasPermission('GENERAL_MANAGER', p)).toBe(true);
    }
  });

  it('AGM shares the GM portal but is a strict subset of it', () => {
    const gm = new Set(permissionsForRole('GENERAL_MANAGER'));
    const agm = permissionsForRole('ASSISTANT_GENERAL_MANAGER');
    for (const p of agm) expect(gm.has(p)).toBe(true);
    expect(agm.length).toBeLessThan(gm.size);
  });

  it('withholds export, payroll, owner data and staff deletion from the AGM', () => {
    for (const p of ['finance.export', 'staff.delete', 'payroll.read', 'owner.read']) {
      expect(roleHasPermission('GENERAL_MANAGER', p)).toBe(true);
      expect(roleHasPermission('ASSISTANT_GENERAL_MANAGER', p)).toBe(false);
    }
  });

  it('gives the RECEPTIONIST exactly the front-desk set', () => {
    expect(permissionsForRole('RECEPTIONIST').sort()).toEqual(
      [
        'reservation.read',
        'reservation.create',
        'reservation.update',
        // Reception cancels bookings: a guest who rings to cancel cannot be
        // told to wait for the GM. Sales and the travel desk, who can RAISE
        // bookings, deliberately do not get this one.
        'reservation.cancel',
        'checkin.perform',
        'checkout.perform',
        'guest.read',
        'guest.create',
        'room.read',
        'room.status.update',
        // Reception may raise a maintenance work order for a fault a guest reports.
        'maintenance.report',
        'keycard.issue',
        'payment.collect',
      ].sort(),
    );
  });

  it('gives the ROOM_ATTENDANT exactly the task set', () => {
    expect(permissionsForRole('ROOM_ATTENDANT').sort()).toEqual(
      [
        'task.read',
        'task.start',
        'task.complete',
        'maintenance.report',
        'room.read',
        'room.status.update',
      ].sort(),
    );
  });

  it('only GM, AGM and HR may create staff; only GM and AGM approve; only GM deletes', () => {
    for (const role of hotelStaffRoleValues) {
      const canCreate = roleHasPermission(role, 'staff.create');
      const canApprove = roleHasPermission(role, 'staff.approve');
      const canDelete = roleHasPermission(role, 'staff.delete');
      const isManagement = role === 'GENERAL_MANAGER' || role === 'ASSISTANT_GENERAL_MANAGER';
      expect({ role, canCreate }).toEqual({ role, canCreate: isManagement || role === 'HR' });
      expect({ role, canApprove }).toEqual({ role, canApprove: isManagement });
      expect({ role, canDelete }).toEqual({ role, canDelete: role === 'GENERAL_MANAGER' });
    }
  });

  // The headline rule for the new role: HR hires, HR never signs off, and HR
  // never sees a rupee.
  it('HR may read, create and update staff — and nothing else', () => {
    expect(permissionsForRole('HR').sort()).toEqual(
      ['staff.read', 'staff.create', 'staff.update', 'profile.read'].sort(),
    );
  });

  it('withholds approval and deletion from HR, so its accounts need a manager', () => {
    expect(roleHasPermission('HR', 'staff.create')).toBe(true);
    expect(roleHasPermission('HR', 'staff.approve')).toBe(false);
    expect(roleHasPermission('HR', 'staff.delete')).toBe(false);
  });

  it('HR holds nothing financial, payroll, procurement or owner-related', () => {
    const perms = permissionsForRole('HR');
    expect(perms.length).toBeGreaterThan(0);
    expect(perms.filter((p) => SENSITIVE.test(p))).toEqual([]);
  });

  it('resolves an unknown role to no permissions, never to all', () => {
    expect(permissionsForRole('SUPER_HACKER')).toEqual([]);
    expect(roleHasPermission('SUPER_HACKER', 'finance.read')).toBe(false);
  });

  it('hands out a copy, so a caller cannot mutate the source of truth', () => {
    const perms = permissionsForRole('CHEF');
    perms.push('finance.export');
    expect(permissionsForRole('CHEF')).not.toContain('finance.export');
  });
});
