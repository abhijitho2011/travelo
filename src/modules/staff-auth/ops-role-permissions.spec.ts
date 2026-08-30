import { permissionsForRole, roleHasPermission } from './role-permissions';

/**
 * Locks the security contract for the five operations roles this domain adds.
 * The general invariants live in role-permissions.spec.ts; these are the
 * role-by-role rules the ops surface depends on.
 */

/** Money/ownership/people-cost namespaces the operational ops roles must not see. */
const SENSITIVE = /^(finance|revenue|payroll|payment|procurement|owner)\./;
/** The two namespaces NONE of the five may ever gain. */
const NEVER = /^(payroll|owner)\./;

describe('ops role → permission contract', () => {
  const five = ['ACCOUNTS', 'INVENTORY_STORE_MANAGER', 'SALES_MANAGER', 'TRAVEL_DESK', 'DRIVER'];

  it('none of the five gain payroll.* or owner.*', () => {
    for (const role of five) {
      expect({ role, leaks: permissionsForRole(role).filter((p) => NEVER.test(p)) }).toEqual({
        role,
        leaks: [],
      });
    }
  });

  it('ACCOUNTS owns the expense register and the revenue rollup', () => {
    for (const p of [
      'expense.read',
      'expense.create',
      'expense.update',
      'finance.read',
      'revenue.read',
      'dashboard.read',
    ]) {
      expect(roleHasPermission('ACCOUNTS', p)).toBe(true);
    }
  });

  it('INVENTORY owns items, stock and the PO lifecycle — but no revenue', () => {
    for (const p of [
      'inventory.read',
      'inventory.create',
      'inventory.update',
      'stock.read',
      'stock.adjust',
      'supplier.read',
      'supplier.create',
      'supplier.update',
      'po.read',
      'po.create',
      'po.update',
      'po.receive',
    ]) {
      expect(roleHasPermission('INVENTORY_STORE_MANAGER', p)).toBe(true);
    }
    // Inventory is not a revenue role.
    expect(
      permissionsForRole('INVENTORY_STORE_MANAGER').filter((p) => /^revenue\./.test(p)),
    ).toEqual([]);
  });

  it('SALES owns leads and the activity timeline', () => {
    for (const p of [
      'lead.read',
      'lead.create',
      'lead.update',
      'activity.read',
      'activity.create',
    ]) {
      expect(roleHasPermission('SALES_MANAGER', p)).toBe(true);
    }
  });

  it('TRAVEL_DESK dispatches transport and manages vehicles — never drives', () => {
    for (const p of [
      'transport.read',
      'transport.create',
      'transport.update',
      'transport.assign',
      'vehicle.read',
      'vehicle.create',
      'vehicle.update',
    ]) {
      expect(roleHasPermission('TRAVEL_DESK', p)).toBe(true);
    }
    expect(roleHasPermission('TRAVEL_DESK', 'transport.drive')).toBe(false);
    // The desk sees no money namespaces.
    expect(permissionsForRole('TRAVEL_DESK').filter((p) => SENSITIVE.test(p))).toEqual([]);
  });

  it('DRIVER drives their own assigned trips — never dispatches, never sees money', () => {
    expect(roleHasPermission('DRIVER', 'transport.read')).toBe(true);
    expect(roleHasPermission('DRIVER', 'transport.drive')).toBe(true);
    // A driver may not assign trips to themselves or others, nor raise bookings.
    expect(roleHasPermission('DRIVER', 'transport.assign')).toBe(false);
    expect(roleHasPermission('DRIVER', 'reservation.create')).toBe(false);
    expect(permissionsForRole('DRIVER').filter((p) => SENSITIVE.test(p))).toEqual([]);
  });

  it('only ACCOUNTS holds expense.* among the five', () => {
    for (const role of ['INVENTORY_STORE_MANAGER', 'SALES_MANAGER', 'TRAVEL_DESK', 'DRIVER']) {
      expect(permissionsForRole(role).filter((p) => /^expense\./.test(p))).toEqual([]);
    }
  });
});
