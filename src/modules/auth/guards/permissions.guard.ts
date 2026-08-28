import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PERMISSIONS_KEY } from '../../../common/decorators/permissions.decorator';
import { PermissionsService } from '../../permissions/permissions.service';
import { AuthenticatedAdmin } from '../../../common/decorators/current-admin.decorator';

@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly permissionsService: PermissionsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<string[]>(PERMISSIONS_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!required || required.length === 0) return true;

    const req = context.switchToHttp().getRequest();
    const admin: AuthenticatedAdmin | undefined = req.admin;
    if (!admin) throw new ForbiddenException('Not authenticated');

    // Always resolve fresh from the cache-backed store so revocations propagate.
    const effective = await this.permissionsService.getEffectivePermissions(admin.id);
    admin.permissions = effective.permissions;
    admin.roles = effective.roles;

    if (!PermissionsService.matches(required, effective.permissions)) {
      throw new ForbiddenException(`Missing required permissions: ${required.join(', ')}`);
    }
    return true;
  }
}
