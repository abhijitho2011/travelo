import { permissionsForRole, roleHasPermission } from '../staff-auth/role-permissions';

const SENSITIVE = /^(finance|revenue|payroll|payment|procurement|owner)\./;

describe('security role permissions', () => {
  it('a guard writes the gate feed and browses the visitor book, but never browses incidents', () => {
    expect(roleHasPermission('SECURITY_STAFF', 'gate.record')).toBe(true);
    expect(roleHasPermission('SECURITY_STAFF', 'visitor.read')).toBe(true);
    expect(roleHasPermission('SECURITY_STAFF', 'incident.create')).toBe(true);
    // The design invariant: a guard reports incidents, only the manager reads them.
    expect(roleHasPermission('SECURITY_STAFF', 'incident.read')).toBe(false);
    expect(roleHasPermission('SECURITY_STAFF', 'shift.assign')).toBe(false);
  });

  it('the manager reads incidents, assigns/resolves them and owns the roster', () => {
    for (const p of [
      'incident.read',
      'incident.update',
      'shift.read',
      'shift.assign',
      'staff.attendance.read',
      'gate.record',
      'visitor.read',
    ]) {
      expect(roleHasPermission('SECURITY_MANAGER', p)).toBe(true);
    }
  });

  it('neither security role holds anything financial (the headline invariant)', () => {
    for (const role of ['SECURITY_STAFF', 'SECURITY_MANAGER']) {
      const perms = permissionsForRole(role);
      expect(perms.length).toBeGreaterThan(0);
      expect({ role, leaks: perms.filter((p) => SENSITIVE.test(p)) }).toEqual({ role, leaks: [] });
    }
  });
});
