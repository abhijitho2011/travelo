import { permissionsForRole, roleHasPermission } from '../staff-auth/role-permissions';

const SENSITIVE = /^(finance|revenue|payroll|payment|procurement|owner)\./;

describe('spa role permissions', () => {
  it('lets the manager own the service catalogue and read the outlet takings', () => {
    for (const p of [
      'spa.read',
      'spa.service.read',
      'spa.service.create',
      'spa.service.update',
      'spa.service.delete',
      'spa.booking.create',
      'spa.booking.update',
      'spa.roster.update',
      'spa.bill.read',
      'spa.revenue.read',
    ]) {
      expect(roleHasPermission('SPA_MANAGER', p)).toBe(true);
    }
  });

  it('the manager cannot settle or refund bills — that is the accounts desk', () => {
    expect(roleHasPermission('SPA_MANAGER', 'spa.bill.settle')).toBe(false);
    expect(roleHasPermission('SPA_MANAGER', 'spa.bill.refund')).toBe(false);
  });

  it('gives the accounts desk the billing lifecycle', () => {
    for (const p of ['spa.bill.read', 'spa.bill.create', 'spa.bill.settle', 'spa.bill.refund']) {
      expect(roleHasPermission('SPA_ACCOUNTS', p)).toBe(true);
    }
  });

  it('lets a therapist advance their own appointments but not assign or manage services', () => {
    expect(roleHasPermission('SPA_STAFF', 'spa.booking.update')).toBe(true);
    expect(roleHasPermission('SPA_STAFF', 'spa.roster.update')).toBe(false);
    expect(roleHasPermission('SPA_STAFF', 'spa.service.create')).toBe(false);
  });

  it('SPA_STAFF holds nothing financial (billing is the accounts desk)', () => {
    const perms = permissionsForRole('SPA_STAFF');
    expect(perms.length).toBeGreaterThan(0);
    expect(perms.filter((p) => SENSITIVE.test(p))).toEqual([]);
    expect(perms).not.toContain('spa.bill.settle');
  });
});
