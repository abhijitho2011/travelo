import { SetMetadata } from '@nestjs/common';

export const PERMISSIONS_KEY = 'required_permissions';

/**
 * Require one or more permissions to access an endpoint.
 * The RBAC guard resolves the caller's effective permission set and checks
 * for either the wildcard "*" or every listed key.
 */
export const RequirePermissions = (...permissions: string[]): MethodDecorator & ClassDecorator =>
  SetMetadata(PERMISSIONS_KEY, permissions);
