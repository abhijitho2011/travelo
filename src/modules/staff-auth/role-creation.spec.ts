import { hotelStaffRoleValues } from '../../database/schema';
import { canCreateRole, creatableRolesFor, staffCreatableRoleValues } from './role-creation';
import { roleHasPermission } from './role-permissions';

const MANAGEMENT = ['GENERAL_MANAGER', 'ASSISTANT_GENERAL_MANAGER'];

describe('creatableRolesFor — who may create whom', () => {
  it('lets the GM create everything except management', () => {
    const allowed = creatableRolesFor('GENERAL_MANAGER');
    for (const role of MANAGEMENT) expect(allowed).not.toContain(role);
    // Everything else, HR included, is on the table for a GM.
    expect(allowed).toContain('HR');
    expect(allowed).toContain('RECEPTIONIST');
    expect([...allowed].sort()).toEqual([...staffCreatableRoleValues].sort());
  });

  it('gives the AGM exactly the GM’s creatable set — HR included', () => {
    expect([...creatableRolesFor('ASSISTANT_GENERAL_MANAGER')].sort()).toEqual(
      [...creatableRolesFor('GENERAL_MANAGER')].sort(),
    );
    expect(creatableRolesFor('ASSISTANT_GENERAL_MANAGER')).toContain('HR');
  });

  it('lets HR create everything except management AND another HR', () => {
    const allowed = creatableRolesFor('HR');
    for (const role of [...MANAGEMENT, 'HR']) expect(allowed).not.toContain(role);
    expect(allowed).toContain('RECEPTIONIST');
    expect(allowed).toContain('CHEF');
    // Exactly one role narrower than what a manager may create.
    expect(allowed).toHaveLength(creatableRolesFor('GENERAL_MANAGER').length - 1);
  });

  it('gives every other role — and an unknown role — nothing at all', () => {
    for (const role of hotelStaffRoleValues) {
      if (['GENERAL_MANAGER', 'ASSISTANT_GENERAL_MANAGER', 'HR'].includes(role)) continue;
      expect({ role, allowed: creatableRolesFor(role) }).toEqual({ role, allowed: [] });
    }
    expect(creatableRolesFor('SUPER_HACKER')).toEqual([]);
    expect(creatableRolesFor('')).toEqual([]);
  });

  it('never returns a role for an actor without staff.create', () => {
    for (const role of hotelStaffRoleValues) {
      if (roleHasPermission(role, 'staff.create')) continue;
      expect(creatableRolesFor(role)).toEqual([]);
    }
  });

  it('never lets any actor create GM or AGM — no exceptions', () => {
    for (const role of [...hotelStaffRoleValues, 'SUPER_HACKER']) {
      for (const management of MANAGEMENT) {
        expect(canCreateRole(role, management)).toBe(false);
      }
    }
  });

  it('never lets HR create HR, while managers may', () => {
    expect(canCreateRole('HR', 'HR')).toBe(false);
    expect(canCreateRole('GENERAL_MANAGER', 'HR')).toBe(true);
    expect(canCreateRole('ASSISTANT_GENERAL_MANAGER', 'HR')).toBe(true);
  });

  it('keeps every per-actor set inside the property-wide whitelist', () => {
    const outer = new Set<string>(staffCreatableRoleValues);
    for (const role of hotelStaffRoleValues) {
      for (const target of creatableRolesFor(role)) expect(outer.has(target)).toBe(true);
    }
  });
});

describe('staffCreatableRoleValues — the property-wide outer bound', () => {
  it('is every declared role minus the two management roles', () => {
    expect(staffCreatableRoleValues).toHaveLength(hotelStaffRoleValues.length - 2);
    for (const role of MANAGEMENT) expect(staffCreatableRoleValues).not.toContain(role);
    expect(staffCreatableRoleValues).toContain('HR');
  });
});
