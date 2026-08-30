import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { EntitlementsService } from '../../modules/entitlements/entitlements.service';
import { REQUIRE_FEATURE } from '../decorators/require-feature.decorator';

/**
 * Enforces plan entitlements. Runs after the owner/staff JWT guard so the
 * principal is present, resolves the tenant's effective features (plan features
 * with admin overrides applied — the same resolver the console reads), and
 * blocks the request when the required feature is absent.
 *
 * Fail-open on the edges, like {@link SubscriptionStatusGuard}: a route with no
 * @RequireFeature, or a non-tenant (admin) request, passes untouched — the guard
 * only ever governs routes that explicitly opt in.
 */
@Injectable()
export class FeatureGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly entitlements: EntitlementsService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const feature = this.reflector.getAllAndOverride<string>(REQUIRE_FEATURE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (!feature) return true;

    const req = context.switchToHttp().getRequest<{
      owner?: { id: string };
      staff?: { ownerId: string };
    }>();
    const ownerId = req.owner?.id ?? req.staff?.ownerId;
    if (!ownerId) return true; // not a tenant surface

    const resolved = await this.entitlements.resolve(ownerId);
    if (resolved.effective.includes(feature)) return true;

    throw new ForbiddenException({
      error: 'FEATURE_NOT_IN_PLAN',
      message: `Your plan does not include ${feature}. Contact Tavelo to add it.`,
    });
  }
}
