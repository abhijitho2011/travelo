import { SetMetadata } from '@nestjs/common';

export const ALLOW_WHEN_INACTIVE = 'allowWhenInactive';

/**
 * Marks a route that must keep working even when the tenant's subscription has
 * lapsed — the owner's own "pay for the next period" call, sign-out, and any
 * path a suspended hotel still needs to settle in-house guests. Everything the
 * {@link SubscriptionStatusGuard} guards is otherwise blocked once the
 * subscription is not usable.
 */
export const AllowWhenInactive = () => SetMetadata(ALLOW_WHEN_INACTIVE, true);
