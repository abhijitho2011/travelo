import { SubscriptionStatusGuard } from './subscription-status.guard';

function ctx(req: Record<string, unknown>, meta = false) {
  return {
    switchToHttp: () => ({ getRequest: () => req }),
    getHandler: () => ({}),
    getClass: () => ({}),
  } as never;
}

function guardWith(status: string | null) {
  const rows = status ? [{ status }] : [];
  const db = {
    select: () => ({
      from: () => ({
        where: () => ({ orderBy: () => ({ limit: async () => rows }) }),
      }),
    }),
  };
  const reflector = { getAllAndOverride: () => false };
  return new SubscriptionStatusGuard(db as never, reflector as never);
}

describe('SubscriptionStatusGuard', () => {
  it('always allows reads, whatever the status', async () => {
    const g = guardWith('SUSPENDED');
    expect(await g.canActivate(ctx({ method: 'GET', owner: { id: 'o1' } }))).toBe(true);
  });

  it('allows a mutation when the subscription is usable', async () => {
    for (const status of ['TRIAL', 'ACTIVE', 'EXPIRING', 'GRACE_PERIOD']) {
      const g = guardWith(status);
      expect(await g.canActivate(ctx({ method: 'POST', owner: { id: 'o1' } }))).toBe(true);
    }
  });

  it('blocks a mutation when the subscription is not usable', async () => {
    for (const status of ['EXPIRED', 'SUSPENDED', 'CANCELLED']) {
      const g = guardWith(status);
      await expect(
        g.canActivate(ctx({ method: 'POST', owner: { id: 'o1' } })),
      ).rejects.toMatchObject({ response: { error: 'SUBSCRIPTION_INACTIVE' } });
    }
  });

  it('resolves the tenant from a staff principal too', async () => {
    const g = guardWith('SUSPENDED');
    await expect(
      g.canActivate(ctx({ method: 'POST', staff: { ownerId: 'o1' } })),
    ).rejects.toMatchObject({ response: { error: 'SUBSCRIPTION_INACTIVE' } });
  });

  it('fails open for a non-tenant (admin) request', async () => {
    const g = guardWith('SUSPENDED');
    expect(await g.canActivate(ctx({ method: 'POST' }))).toBe(true);
  });

  it('fails open when there is no subscription row at all', async () => {
    const g = guardWith(null);
    expect(await g.canActivate(ctx({ method: 'POST', owner: { id: 'o1' } }))).toBe(true);
  });

  it('allows a mutation on a route marked AllowWhenInactive', async () => {
    const db = { select: () => ({ from: () => ({ where: () => ({ orderBy: () => ({ limit: async () => [{ status: 'SUSPENDED' }] }) }) }) }) };
    const reflector = { getAllAndOverride: () => true };
    const g = new SubscriptionStatusGuard(db as never, reflector as never);
    expect(await g.canActivate(ctx({ method: 'POST', owner: { id: 'o1' } }))).toBe(true);
  });
});
