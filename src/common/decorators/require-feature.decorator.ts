import { SetMetadata } from '@nestjs/common';

export const REQUIRE_FEATURE = 'requireFeature';

/**
 * Gates a controller (or route) on a plan feature key, e.g. 'RESTAURANT'. The
 * {@link FeatureGuard} lets the request through only when the tenant's resolved
 * entitlements include the key — so a plan that does not pay for a module cannot
 * reach it. Keys match the plan_features catalogue (PMS, RESTAURANT, …).
 */
export const RequireFeature = (featureKey: string) => SetMetadata(REQUIRE_FEATURE, featureKey);
