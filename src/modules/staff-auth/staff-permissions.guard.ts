import { CanActivate, ExecutionContext, Injectable, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { AuthenticatedStaff } from './current-staff.decorator';
import { StaffErrors } from './staff-errors';

export const STAFF_PERMISSIONS_KEY = 'staff_permissions';

/** Require every listed permission on a staff-guarded route. */
export const RequireStaffPermissions = (...permissions: string[]) =>
  SetMetadata(STAFF_PERMISSIONS_KEY, permissions);

/**
 * Enforces the role→permission map server-side. Must run AFTER StaffJwtGuard,
 * which is what resolves `req.staff.permissions` from the database row — the
 * client's token never carries a permission list, so it cannot forge one.
 */
@Injectable()
export class StaffPermissionsGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string[]>(STAFF_PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const staff: AuthenticatedStaff | undefined = req.staff;
    if (!staff) throw StaffErrors.forbidden('Not authenticated');

    const held = new Set(staff.permissions);
    const missing = required.filter((p) => !held.has(p));
    if (missing.length > 0) {
      throw StaffErrors.forbidden(`Missing permission: ${missing.join(', ')}`);
    }
    return true;
  }
}
