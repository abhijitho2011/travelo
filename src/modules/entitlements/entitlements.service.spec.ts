import { BadRequestException } from '@nestjs/common';
import { EntitlementsService } from './entitlements.service';

describe('EntitlementsService.enforcePropertyLimit', () => {
  it('throws when count >= limit', async () => {
    const db = mkDb({ limit: 2, override: null, count: 2 });
    const svc = new EntitlementsService(db as never, {} as never);
    await expect(svc.enforcePropertyLimit('o1')).rejects.toThrow(BadRequestException);
  });

  it('passes when count < limit', async () => {
    const db = mkDb({ limit: 3, override: null, count: 2 });
    const svc = new EntitlementsService(db as never, {} as never);
    await expect(svc.enforcePropertyLimit('o1')).resolves.toBeUndefined();
  });

  it('override wins over plan limit', async () => {
    const db = mkDb({ limit: 1, override: 5, count: 4 });
    const svc = new EntitlementsService(db as never, {} as never);
    await expect(svc.enforcePropertyLimit('o1')).resolves.toBeUndefined();
  });

  it('throws when no subscription', async () => {
    const db = mkDb({ noSub: true, count: 0 });
    const svc = new EntitlementsService(db as never, {} as never);
    await expect(svc.enforcePropertyLimit('o1')).rejects.toThrow(BadRequestException);
  });
});

function mkDb(cfg: { limit?: number; override?: number | null; count: number; noSub?: boolean }) {
  let stage = 0;
  return {
    select() {
      stage++;
      const isSub = stage === 1;
      return {
        from() {
          return {
            innerJoin() {
              return {
                where() {
                  return {
                    orderBy() {
                      return {
                        limit: async () =>
                          isSub && !cfg.noSub
                            ? [{ propertyLimit: cfg.limit, override: cfg.override }]
                            : [],
                      };
                    },
                  };
                },
              };
            },
            where: async () => (isSub ? [] : [{ count: cfg.count }]),
          };
        },
      };
    },
  };
}
