import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, inArray, isNull, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { spaServices, type SpaService, type SpaServiceStatus } from '../../database/schema';
import { CreateServiceDto, ServiceQueryDto, UpdateServiceDto } from './dto';
import { SpaErrors } from './spa-errors';

/** Any transaction handle or the pool itself — both expose the same query API. */
export type Tx = Pick<Database, 'select' | 'insert' | 'update' | 'delete'>;

/**
 * Spa services catalogue, per property.
 *
 * Tenant isolation runs through every method: a service is only ever resolved by
 * (id, propertyId = the caller's own, deletedAt IS NULL). A foreign id 404s,
 * indistinguishable from a miss — never 403.
 */
@Injectable()
export class SpaServicesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  static toDto(s: SpaService) {
    return {
      id: s.id,
      propertyId: s.propertyId,
      name: s.name,
      description: s.description,
      durationMinutes: s.durationMinutes,
      pricePaise: s.pricePaise,
      status: s.status,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }

  async requireService(propertyId: string, id: string, tx: Tx = this.db): Promise<SpaService> {
    const [row] = await tx
      .select()
      .from(spaServices)
      .where(
        and(
          eq(spaServices.id, id),
          eq(spaServices.propertyId, propertyId),
          isNull(spaServices.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw SpaErrors.serviceNotFound();
    return row;
  }

  async list(propertyId: string, q: ServiceQueryDto) {
    const conds: SQL[] = [eq(spaServices.propertyId, propertyId), isNull(spaServices.deletedAt)];
    if (!q.all) conds.push(eq(spaServices.status, 'ACTIVE' as SpaServiceStatus));
    const rows = await this.db
      .select()
      .from(spaServices)
      .where(and(...conds))
      .orderBy(asc(spaServices.name));
    return { items: rows.map(SpaServicesService.toDto), total: rows.length };
  }

  /** Batch-load services by id, scoped to the property. Used by appointments. */
  async byIds(
    propertyId: string,
    ids: string[],
    tx: Tx = this.db,
  ): Promise<Map<string, SpaService>> {
    if (ids.length === 0) return new Map();
    const rows = await tx
      .select()
      .from(spaServices)
      .where(and(eq(spaServices.propertyId, propertyId), inArray(spaServices.id, ids)));
    return new Map(rows.map((r) => [r.id, r]));
  }

  async create(propertyId: string, dto: CreateServiceDto) {
    try {
      const [row] = await this.db
        .insert(spaServices)
        .values({
          propertyId,
          name: dto.name,
          description: dto.description ?? null,
          durationMinutes: dto.durationMinutes,
          pricePaise: dto.pricePaise,
        })
        .returning();
      return SpaServicesService.toDto(row);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw SpaErrors.duplicateName();
      throw err;
    }
  }

  async update(propertyId: string, id: string, dto: UpdateServiceDto) {
    const before = await this.requireService(propertyId, id);
    try {
      const [row] = await this.db
        .update(spaServices)
        .set({
          name: dto.name ?? before.name,
          description: dto.description ?? before.description,
          durationMinutes: dto.durationMinutes ?? before.durationMinutes,
          pricePaise: dto.pricePaise ?? before.pricePaise,
          status: dto.status ?? before.status,
          updatedAt: new Date(),
        })
        .where(and(eq(spaServices.id, id), eq(spaServices.propertyId, propertyId)))
        .returning();
      return { before, after: SpaServicesService.toDto(row) };
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw SpaErrors.duplicateName();
      throw err;
    }
  }

  /** Soft delete: frees the name for reuse, keeps old appointments resolvable. */
  async remove(propertyId: string, id: string) {
    const before = await this.requireService(propertyId, id);
    await this.db
      .update(spaServices)
      .set({ deletedAt: new Date(), status: 'ARCHIVED', updatedAt: new Date() })
      .where(and(eq(spaServices.id, id), eq(spaServices.propertyId, propertyId)));
    return { id, deleted: true, before };
  }
}
