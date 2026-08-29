import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, ilike, isNull, or, sql, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { integrationConnections, owners, properties, PropertyStatus } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { EntitlementsService } from '../entitlements/entitlements.service';

export interface CreatePropertyInput {
  ownerId: string;
  name: string;
  slug?: string;
  starRating?: number;
  category?: string;
  city?: string;
  state?: string;
  country?: string;
  timezone?: string;
  roomCount?: number;
  contact?: Record<string, unknown>;
  address?: Record<string, unknown>;
}

const SECTIONS = [
  { key: 'basic', weight: 15 },
  { key: 'photos', weight: 20 },
  { key: 'rooms', weight: 20 },
  { key: 'amenities', weight: 15 },
  { key: 'policies', weight: 10 },
  { key: 'contact', weight: 10 },
  { key: 'location', weight: 10 },
];

@Injectable()
export class PropertiesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly entitlements: EntitlementsService,
  ) {}

  async list(params: {
    limit?: number;
    offset?: number;
    q?: string;
    status?: string;
    ownerId?: string;
    state?: string;
    district?: string;
  }) {
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;
    const conds: SQL[] = [isNull(properties.deletedAt)];
    if (params.status) conds.push(eq(properties.status, params.status as PropertyStatus));
    if (params.ownerId) conds.push(eq(properties.ownerId, params.ownerId));
    // Properties store their location as text names. `state` is a first-class
    // column; `district` is not, so it is matched inside the address JSONB.
    if (params.state) conds.push(ilike(properties.state, params.state));
    if (params.district) {
      conds.push(sql`${properties.address}->>'district' ILIKE ${params.district}`);
    }
    if (params.q) {
      const q = `%${params.q}%`;
      conds.push(or(ilike(properties.name, q), ilike(properties.city, q))!);
    }
    const where = and(...conds);
    const rows = await this.db
      .select({ p: properties, ownerName: owners.company })
      .from(properties)
      .leftJoin(owners, eq(properties.ownerId, owners.id))
      .where(where)
      .orderBy(desc(properties.createdAt))
      .limit(limit)
      .offset(offset);
    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(properties)
      .where(where);
    return {
      items: rows.map((r) => ({ ...r.p, owner: r.ownerName })),
      total,
      limit,
      offset,
    };
  }

  async create(dto: CreatePropertyInput) {
    await this.entitlements.enforcePropertyLimit(dto.ownerId);
    const slug =
      dto.slug ??
      dto.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '') +
        '-' +
        Math.random().toString(36).slice(2, 7);
    const [row] = await this.db
      .insert(properties)
      .values({
        ownerId: dto.ownerId,
        name: dto.name,
        slug,
        starRating: dto.starRating,
        category: dto.category,
        city: dto.city,
        state: dto.state,
        country: dto.country,
        timezone: dto.timezone,
        roomCount: dto.roomCount ?? 0,
        contact: dto.contact as never,
        address: dto.address as never,
      })
      .returning();
    row.listingCompleteness = this.scoreListing(row);
    await this.db
      .update(properties)
      .set({ listingCompleteness: row.listingCompleteness })
      .where(eq(properties.id, row.id));
    await this.audit.record({
      action: 'property.created',
      entity: 'property',
      entityId: row.id,
      after: row,
    });
    return row;
  }

  async get(id: string) {
    const [row] = await this.db.select().from(properties).where(eq(properties.id, id)).limit(1);
    if (!row || row.deletedAt) throw new NotFoundException('Property not found');
    return row;
  }

  async overview(id: string) {
    const prop = await this.get(id);
    const integrations = await this.db
      .select()
      .from(integrationConnections)
      .where(eq(integrationConnections.propertyId, id));
    const score = this.scoreListingBreakdown(prop);
    return {
      property: prop,
      integrations,
      listingScore: score,
    };
  }

  async listIntegrations(propertyId: string) {
    return this.db
      .select()
      .from(integrationConnections)
      .where(eq(integrationConnections.propertyId, propertyId));
  }

  scoreListing(p: typeof properties.$inferSelect): number {
    return this.scoreListingBreakdown(p).overall;
  }

  scoreListingBreakdown(p: typeof properties.$inferSelect) {
    const sections: Record<string, number> = {
      basic: p.name && p.starRating && p.category ? 1 : 0.3,
      photos: 0.5,
      rooms: p.roomCount > 0 ? 1 : 0,
      amenities: 0.7,
      policies: 0.6,
      contact: p.contact ? 1 : 0,
      location: p.city && p.country && p.address ? 1 : p.city ? 0.5 : 0,
    };
    let overall = 0;
    const detail: Record<string, number> = {};
    for (const s of SECTIONS) {
      const pct = sections[s.key] ?? 0;
      const points = Math.round(pct * s.weight);
      overall += points;
      detail[s.key] = points;
    }
    return { overall, detail };
  }
}
