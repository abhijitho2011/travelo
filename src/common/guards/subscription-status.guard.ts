import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Inject,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { desc, eq } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { subscriptions } from '../../database/schema';
import { ALLOW_WHEN_INACTIVE } from '../decorators/subscription.decorator';

/** The statuses under which a tenant may still make changes. */
const USABLE_STATUSES = ['TRIAL', 'ACTIVE', 'EXPIRING', 'GRACE_PERIOD'];

/**
 * Gives non-payment a consequence.
 *
 * Runs AFTER the owner/staff JWT guard (so the principal is on the request) and
 * blocks MUTATING requests once the tenant's subscription is EXPIRED, SUSPENDED
 * or CANCELLED. Reads are always allowed — a lapsed tenant must still see their
 * data and reach the pay button — as are routes marked {@link AllowWhenInactive}
 * (paying, signing out, settling in-house guests).
 *
 * Deliberately fail-open on the edges: an admin request (no tenant), or a
 * principal with no subscription row at all, is let through rather than hard
 * 403'd, so this can never lock a surface it was not meant to govern.
 */
@Injectable()
export class SubscriptionStatusGuard implements CanActivate {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<{
      method: string;
      owner?: { id: string };
      staff?: { ownerId: string };
    }>();

    // Reads never blocked; unsafe verbs are what a lapsed tenant loses.
    if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;

    const exempt = this.reflector.getAllAndOverride<boolean>(ALLOW_WHEN_INACTIVE, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (exempt) return true;

    const ownerId = req.owner?.id ?? req.staff?.ownerId;
    if (!ownerId) return true; // not a tenant surface (e.g. admin)

    const [sub] = await this.db
      .select({ status: subscriptions.status })
      .from(subscriptions)
      .where(eq(subscriptions.ownerId, ownerId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    if (!sub || USABLE_STATUSES.includes(sub.status)) return true;

    throw new ForbiddenException({
      error: 'SUBSCRIPTION_INACTIVE',
      message:
        'This action needs an active subscription. Renew from the owner app to continue — ' +
        'your data is safe and reads still work.',
    });
  }
}
