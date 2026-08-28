import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { features, planFeatures, subscriptionPlans, subscriptions } from '../../database/schema';
import { AuditService } from '../audit/audit.service';

@Injectable()
export class PlansService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  async list() {
    const plans = await this.db
      .select()
      .from(subscriptionPlans)
      .orderBy(subscriptionPlans.monthlyPrice);
    const pfs = await this.db.select().from(planFeatures);
    const featureRows = await this.db.select().from(features);
    const featureName = new Map(featureRows.map((f) => [f.key, f.name]));
    const featuresByPlan = new Map<string, string[]>();
    for (const pf of pfs) {
      const arr = featuresByPlan.get(pf.planId) ?? [];
      arr.push(featureName.get(pf.featureKey) ?? pf.featureKey);
      featuresByPlan.set(pf.planId, arr);
    }
    const subs = await this.db
      .select({
        planId: subscriptions.planId,
        count: sql<number>`count(*)::int`,
      })
      .from(subscriptions)
      .groupBy(subscriptions.planId);
    const subCount = new Map(subs.map((s) => [s.planId, s.count]));
    return plans.map((p) => ({
      id: p.id,
      name: p.name,
      description: p.description,
      limit: p.propertyLimit,
      monthly: p.monthlyPrice,
      annual: p.annualPrice,
      currency: p.currency,
      status: p.status === 'ACTIVE' ? 'Active' : 'Inactive',
      features: featuresByPlan.get(p.id) ?? [],
      subscribers: subCount.get(p.id) ?? 0,
    }));
  }

  async get(id: string) {
    const [row] = await this.db
      .select()
      .from(subscriptionPlans)
      .where(eq(subscriptionPlans.id, id))
      .limit(1);
    if (!row) throw new NotFoundException('Plan not found');
    const fs = await this.db
      .select({ key: planFeatures.featureKey })
      .from(planFeatures)
      .where(eq(planFeatures.planId, id));
    return { ...row, features: fs.map((f) => f.key) };
  }

  async create(dto: {
    name: string;
    description?: string;
    monthlyPrice: number;
    annualPrice: number;
    propertyLimit: number;
    currency?: string;
    features?: string[];
  }) {
    const [row] = await this.db
      .insert(subscriptionPlans)
      .values({
        name: dto.name,
        description: dto.description,
        monthlyPrice: dto.monthlyPrice,
        annualPrice: dto.annualPrice,
        propertyLimit: dto.propertyLimit,
        currency: dto.currency ?? 'INR',
      })
      .returning();
    if (dto.features?.length) {
      await this.db
        .insert(planFeatures)
        .values(dto.features.map((k) => ({ planId: row.id, featureKey: k })))
        .onConflictDoNothing();
    }
    await this.audit.record({
      action: 'plan.created',
      entity: 'plan',
      entityId: row.id,
      after: row,
    });
    return this.get(row.id);
  }

  async update(
    id: string,
    dto: Partial<{
      name: string;
      description: string;
      monthlyPrice: number;
      annualPrice: number;
      propertyLimit: number;
      status: 'ACTIVE' | 'ARCHIVED';
    }>,
  ) {
    const before = await this.get(id);
    await this.db
      .update(subscriptionPlans)
      .set({ ...dto, updatedAt: new Date() })
      .where(eq(subscriptionPlans.id, id));
    const after = await this.get(id);
    await this.audit.record({
      action: 'plan.updated',
      entity: 'plan',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  async setFeatures(id: string, keys: string[]) {
    await this.db.delete(planFeatures).where(eq(planFeatures.planId, id));
    if (keys.length) {
      await this.db.insert(planFeatures).values(keys.map((k) => ({ planId: id, featureKey: k })));
    }
    await this.audit.record({
      action: 'plan.features.set',
      entity: 'plan',
      entityId: id,
      after: { features: keys },
    });
    return this.get(id);
  }

  async archive(id: string) {
    return this.update(id, { status: 'ARCHIVED' });
  }

  async featureCatalog() {
    return this.db.select().from(features).orderBy(features.name);
  }
}
