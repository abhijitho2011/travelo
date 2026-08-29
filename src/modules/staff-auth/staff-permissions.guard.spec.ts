import { HttpException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { StaffPermissionsGuard, STAFF_PERMISSIONS_KEY } from './staff-permissions.guard';
import { permissionsForRole } from './role-permissions';
import { AuthenticatedStaff } from './current-staff.decorator';

function ctxFor(staff: Partial<AuthenticatedStaff> | undefined) {
  return {
    getHandler: () => undefined,
    getClass: () => undefined,
    switchToHttp: () => ({ getRequest: () => ({ staff }) }),
  } as never;
}

/** Stands in for the @RequireStaffPermissions metadata on a route. */
function reflectorFor(required: string[] | undefined) {
  return {
    getAllAndOverride: (key: string) => (key === STAFF_PERMISSIONS_KEY ? required : undefined),
  } as unknown as Reflector;
}

function actor(role: string): Partial<AuthenticatedStaff> {
  return { id: 'me', role, permissions: permissionsForRole(role) };
}

describe('StaffPermissionsGuard', () => {
  it('lets an unannotated route through', () => {
    const guard = new StaffPermissionsGuard(reflectorFor(undefined));
    expect(guard.canActivate(ctxFor(actor('CLEANER')))).toBe(true);
  });

  it('admits a GM to staff.create', () => {
    const guard = new StaffPermissionsGuard(reflectorFor(['staff.create']));
    expect(guard.canActivate(ctxFor(actor('GENERAL_MANAGER')))).toBe(true);
  });

  it('admits an AGM to staff.create but NOT to staff.delete', () => {
    expect(
      new StaffPermissionsGuard(reflectorFor(['staff.create'])).canActivate(
        ctxFor(actor('ASSISTANT_GENERAL_MANAGER')),
      ),
    ).toBe(true);
    expect(() =>
      new StaffPermissionsGuard(reflectorFor(['staff.delete'])).canActivate(
        ctxFor(actor('ASSISTANT_GENERAL_MANAGER')),
      ),
    ).toThrow(HttpException);
  });

  it('keeps every non-management role out of team creation', () => {
    const guard = new StaffPermissionsGuard(reflectorFor(['staff.create']));
    for (const role of ['RECEPTIONIST', 'CHEF', 'SECURITY_STAFF', 'ACCOUNTS', 'ROOM_ATTENDANT']) {
      expect(() => guard.canActivate(ctxFor(actor(role)))).toThrow(HttpException);
    }
  });

  it('reports the missing permission with a STAFF_FORBIDDEN code', () => {
    const guard = new StaffPermissionsGuard(reflectorFor(['staff.delete']));
    try {
      guard.canActivate(ctxFor(actor('RECEPTIONIST')));
      throw new Error('should have thrown');
    } catch (err) {
      const resp = (err as HttpException).getResponse() as { error: string; message: string };
      expect(resp.error).toBe('STAFF_FORBIDDEN');
      expect(resp.message).toContain('staff.delete');
    }
  });

  it('refuses when no staff is attached — the JWT guard must have run first', () => {
    const guard = new StaffPermissionsGuard(reflectorFor(['staff.read']));
    expect(() => guard.canActivate(ctxFor(undefined))).toThrow(HttpException);
  });

  it('ignores a permission list forged onto the request but absent from the role', () => {
    // req.staff.permissions is written by StaffJwtGuard from the DB row, so this
    // scenario cannot arise over HTTP; the guard is still strictly list-driven.
    const guard = new StaffPermissionsGuard(reflectorFor(['staff.delete', 'finance.export']));
    expect(() =>
      guard.canActivate(ctxFor({ id: 'me', role: 'RECEPTIONIST', permissions: ['staff.delete'] })),
    ).toThrow(HttpException);
  });
});
