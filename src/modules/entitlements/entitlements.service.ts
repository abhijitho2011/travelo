import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  ownerFeatureOverrides,
  planFeatures,
  properties,
  subscriptionPlans,
  subscriptions,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class EntitlementsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async resolve(ownerId: string) {
    const [sub] = await this.db
      .select({ planId: subscriptions.planId, status: subscriptions.status })
      .from(subscriptions)
      .where(eq(subscriptions.ownerId, ownerId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    const planKeys = sub
      ? (
          await this.db
            .select({ key: planFeatures.featureKey })
            .from(planFeatures)
            .where(eq(planFeatures.planId, sub.planId))
        ).map((r) => r.key)
      : [];
    const overrides = await this.db
      .select()
      .from(ownerFeatureOverrides)
      .where(eq(ownerFeatureOverrides.ownerId, ownerId));
    const set = new Set<string>(planKeys);
    for (const o of overrides) {
      if (o.granted) set.add(o.featureKey);
      else set.delete(o.featureKey);
    }
    return {
      planFeatures: planKeys,
      overrides,
      effective: Array.from(set).sort(),
      subscription: sub ?? null,
    };
  }

  async addOverride(
    ownerId: string,
    dto: { featureKey: string; granted?: boolean; reason?: string },
  ) {
    const [row] = await this.db
      .insert(ownerFeatureOverrides)
      .values({
        ownerId,
        featureKey: dto.featureKey,
        granted: dto.granted ?? true,
        reason: dto.reason,
      })
      .onConflictDoUpdate({
        target: [ownerFeatureOverrides.ownerId, ownerFeatureOverrides.featureKey],
        set: { granted: dto.granted ?? true, reason: dto.reason },
      })
      .returning();
    await this.audit.record({
      action: 'entitlement.override.set',
      entity: 'owner',
      entityId: ownerId,
      after: row,
    });
    return row;
  }

  async removeOverride(ownerId: string, overrideId: string) {
    const [row] = await this.db
      .delete(ownerFeatureOverrides)
      .where(
        and(eq(ownerFeatureOverrides.id, overrideId), eq(ownerFeatureOverrides.ownerId, ownerId)),
      )
      .returning();
    if (!row) throw new NotFoundException('Override not found');
    await this.audit.record({
      action: 'entitlement.override.removed',
      entity: 'owner',
      entityId: ownerId,
      before: row,
    });
    return { deleted: true };
  }

  async enforcePropertyLimit(ownerId: string): Promise<void> {
    const [sub] = await this.db
      .select({
        propertyLimit: subscriptionPlans.propertyLimit,
        override: subscriptions.propertyLimitOverride,
      })
      .from(subscriptions)
      .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
      .where(eq(subscriptions.ownerId, ownerId))
      .orderBy(desc(subscriptions.createdAt))
      .limit(1);
    if (!sub) {
      throw new BadRequestException('Owner has no active subscription');
    }
    const limit = sub.override ?? sub.propertyLimit;
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(properties)
      .where(eq(properties.ownerId, ownerId));
    if (count >= limit) {
      throw new BadRequestException(`Property limit reached (${count}/${limit}) for current plan`);
    }
  }
}
