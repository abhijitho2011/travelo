import { FeatureGuard } from './feature.guard';

function ctx(req: Record<string, unknown>) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as never;
}

function guard(feature: string | undefined, effective: string[]) {
  const reflector = { getAllAndOverride: () => feature };
  const entitlements = { resolve: async () => ({ effective }) };
  return new FeatureGuard(reflector as never, entitlements as never);
}

describe('FeatureGuard', () => {
  it('allows a route with no @RequireFeature', async () => {
    expect(await guard(undefined, []).canActivate(ctx({ owner: { id: 'o1' } }))).toBe(true);
  });

  it('allows when the tenant plan includes the feature', async () => {
    const g = guard('RESTAURANT', ['PMS', 'RESTAURANT']);
    expect(await g.canActivate(ctx({ staff: { ownerId: 'o1' } }))).toBe(true);
  });

  it('blocks when the feature is not in the plan', async () => {
    const g = guard('RESTAURANT', ['PMS', 'ANALYTICS']);
    await expect(g.canActivate(ctx({ staff: { ownerId: 'o1' } }))).rejects.toMatchObject({
      response: { error: 'FEATURE_NOT_IN_PLAN' },
    });
  });

  it('fails open for a non-tenant (admin) request', async () => {
    const g = guard('RESTAURANT', []);
    expect(await g.canActivate(ctx({}))).toBe(true);
  });
});
