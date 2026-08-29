import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  restaurantTables,
  type RestaurantTable,
  type RestaurantTableStatus,
} from '../../database/schema';
import { CreateTableDto, TableFilterDto, UpdateTableDto } from './dto';
import { RestaurantErrors } from './restaurant-errors';

/** Any transaction handle or the pool itself — both expose the same query API. */
export type Tx = Pick<Database, 'select' | 'insert' | 'update' | 'delete'>;

/**
 * Restaurant tables, per property.
 *
 * Tenant isolation runs through every method: a table is only ever resolved by
 * (id, propertyId = the caller's own, deletedAt IS NULL). A foreign id 404s,
 * indistinguishable from a miss — never 403.
 */
@Injectable()
export class TablesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  static toDto(t: RestaurantTable) {
    return {
      id: t.id,
      propertyId: t.propertyId,
      name: t.name,
      seats: t.seats,
      status: t.status,
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  /** The single choke point: (id, propertyId, not deleted) or 404. */
  async requireTable(propertyId: string, id: string, tx: Tx = this.db): Promise<RestaurantTable> {
    const [row] = await tx
      .select()
      .from(restaurantTables)
      .where(
        and(
          eq(restaurantTables.id, id),
          eq(restaurantTables.propertyId, propertyId),
          isNull(restaurantTables.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw RestaurantErrors.tableNotFound();
    return row;
  }

  async list(propertyId: string, params: TableFilterDto = {}) {
    const conds: SQL[] = [
      eq(restaurantTables.propertyId, propertyId),
      isNull(restaurantTables.deletedAt),
    ];
    if (params.status) conds.push(eq(restaurantTables.status, params.status));
    const rows = await this.db
      .select()
      .from(restaurantTables)
      .where(and(...conds))
      .orderBy(asc(restaurantTables.name));
    return rows.map(TablesService.toDto);
  }

  async create(propertyId: string, dto: CreateTableDto) {
    try {
      const [row] = await this.db
        .insert(restaurantTables)
        .values({ propertyId, name: dto.name.trim(), seats: dto.seats })
        .returning();
      return TablesService.toDto(row);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw RestaurantErrors.duplicateName('table');
      throw err;
    }
  }

  async update(propertyId: string, id: string, dto: UpdateTableDto) {
    const before = await this.requireTable(propertyId, id);
    const patch: Partial<typeof restaurantTables.$inferInsert> = { updatedAt: new Date() };
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.seats !== undefined) patch.seats = dto.seats;
    if (dto.status !== undefined) patch.status = dto.status as RestaurantTableStatus;
    try {
      const [after] = await this.db
        .update(restaurantTables)
        .set(patch)
        .where(eq(restaurantTables.id, id))
        .returning();
      return { before: TablesService.toDto(before), after: TablesService.toDto(after) };
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw RestaurantErrors.duplicateName('table');
      throw err;
    }
  }

  async remove(propertyId: string, id: string) {
    const before = await this.requireTable(propertyId, id);
    await this.db
      .update(restaurantTables)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(restaurantTables.id, id));
    return { id, deleted: true, before: TablesService.toDto(before) };
  }

  /** Move a table's status inside the SAME tx as the order change that drives it. */
  static async setStatus(
    tx: Tx,
    tableId: string,
    status: RestaurantTableStatus,
  ): Promise<void> {
    await tx
      .update(restaurantTables)
      .set({ status, updatedAt: new Date() })
      .where(eq(restaurantTables.id, tableId));
  }
}
