import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, isNull, SQL, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  inventoryItems,
  stockMovements,
  type InventoryItem,
  type StockMovement,
  type StockMovementType,
} from '../../database/schema';
import { CreateItemDto, ItemFilterDto, MovementFilterDto, UpdateItemDto } from './dto';
import { InventoryErrors } from './inventory-errors';
import { stockDelta, stockStaysNonNegative } from './inventory-rules';

/** Any transaction handle or the pool itself — both expose the same query API. */
export type Tx = Pick<Database, 'select' | 'insert' | 'update' | 'delete'>;

export interface ApplyMovementInput {
  propertyId: string;
  itemId: string;
  type: StockMovementType;
  qty: number;
  reason?: string | null;
  purchaseOrderId?: string | null;
  createdBy?: string | null;
}

/**
 * Inventory items and their stock movements, per property.
 *
 * THE INVARIANT: `current_qty` is ONLY ever changed by `applyMovement`, which
 * writes the matching `stock_movements` row in the SAME transaction. On-hand and
 * the movement ledger can therefore never disagree.
 */
@Injectable()
export class ItemsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  static toDto(i: InventoryItem) {
    return {
      id: i.id,
      propertyId: i.propertyId,
      name: i.name,
      sku: i.sku,
      unit: i.unit,
      category: i.category,
      reorderLevel: i.reorderLevel,
      currentQty: i.currentQty,
      unitCostPaise: i.unitCostPaise,
      stockValuePaise: i.currentQty * i.unitCostPaise,
      lowStock: i.currentQty <= i.reorderLevel,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    };
  }

  static movementToDto(m: StockMovement) {
    return {
      id: m.id,
      propertyId: m.propertyId,
      itemId: m.itemId,
      type: m.type,
      qty: m.qty,
      qtyDelta: m.qtyDelta,
      balanceAfter: m.balanceAfter,
      reason: m.reason,
      purchaseOrderId: m.purchaseOrderId,
      createdBy: m.createdBy,
      createdAt: m.createdAt,
    };
  }

  async requireItem(propertyId: string, id: string, tx: Tx = this.db): Promise<InventoryItem> {
    const [row] = await tx
      .select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.id, id),
          eq(inventoryItems.propertyId, propertyId),
          isNull(inventoryItems.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw InventoryErrors.itemNotFound();
    return row;
  }

  async list(propertyId: string, params: ItemFilterDto = {}) {
    const conds: SQL[] = [
      eq(inventoryItems.propertyId, propertyId),
      isNull(inventoryItems.deletedAt),
    ];
    if (params.category) conds.push(eq(inventoryItems.category, params.category));
    if (params.lowStock)
      conds.push(sql`${inventoryItems.currentQty} <= ${inventoryItems.reorderLevel}`);
    const limit = Math.min(params.limit ?? 100, 500);
    const offset = params.offset ?? 0;

    const rows = await this.db
      .select()
      .from(inventoryItems)
      .where(and(...conds))
      .orderBy(asc(inventoryItems.name))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(inventoryItems)
      .where(and(...conds));

    return { items: rows.map(ItemsService.toDto), total: count, limit, offset };
  }

  /** Items at or below their reorder level — the reorder worklist. */
  async lowStock(propertyId: string) {
    const rows = await this.db
      .select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.propertyId, propertyId),
          isNull(inventoryItems.deletedAt),
          sql`${inventoryItems.currentQty} <= ${inventoryItems.reorderLevel}`,
        ),
      )
      .orderBy(asc(inventoryItems.currentQty));
    return rows.map(ItemsService.toDto);
  }

  async get(propertyId: string, id: string) {
    return ItemsService.toDto(await this.requireItem(propertyId, id));
  }

  async create(propertyId: string, dto: CreateItemDto, createdBy: string) {
    return this.db.transaction(async (trx) => {
      const tx = trx as unknown as Tx;
      let row: InventoryItem;
      try {
        [row] = await tx
          .insert(inventoryItems)
          .values({
            propertyId,
            name: dto.name.trim(),
            sku: dto.sku.trim(),
            unit: dto.unit?.trim() || 'pcs',
            category: dto.category?.trim() || null,
            reorderLevel: dto.reorderLevel ?? 0,
            currentQty: 0,
            unitCostPaise: dto.unitCostPaise ?? 0,
          })
          .returning();
      } catch (err) {
        if ((err as { code?: string }).code === '23505') throw InventoryErrors.duplicateSku();
        throw err;
      }
      // An opening balance is recorded as the item's first movement, so on-hand
      // always traces back to the ledger.
      if (dto.openingQty && dto.openingQty > 0) {
        await ItemsService.applyMovement(tx, {
          propertyId,
          itemId: row.id,
          type: 'ADJUST',
          qty: dto.openingQty,
          reason: 'Opening balance',
          createdBy,
        });
        row = await this.requireItem(propertyId, row.id, tx);
      }
      return ItemsService.toDto(row);
    });
  }

  async update(propertyId: string, id: string, dto: UpdateItemDto) {
    const before = await this.requireItem(propertyId, id);
    const patch: Partial<typeof inventoryItems.$inferInsert> = { updatedAt: new Date() };
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.sku !== undefined) patch.sku = dto.sku.trim();
    if (dto.unit !== undefined) patch.unit = dto.unit.trim();
    if (dto.category !== undefined) patch.category = dto.category.trim() || null;
    if (dto.reorderLevel !== undefined) patch.reorderLevel = dto.reorderLevel;
    if (dto.unitCostPaise !== undefined) patch.unitCostPaise = dto.unitCostPaise;
    try {
      const [after] = await this.db
        .update(inventoryItems)
        .set(patch)
        .where(eq(inventoryItems.id, id))
        .returning();
      return { before: ItemsService.toDto(before), after: ItemsService.toDto(after) };
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw InventoryErrors.duplicateSku();
      throw err;
    }
  }

  async remove(propertyId: string, id: string) {
    const before = await this.requireItem(propertyId, id);
    await this.db
      .update(inventoryItems)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(inventoryItems.id, id));
    return { id, deleted: true, before: ItemsService.toDto(before) };
  }

  /** Record a single stock movement for an item, adjusting on-hand in one tx. */
  async recordMovement(propertyId: string, itemId: string, dto: CreateMovementInput) {
    return this.db.transaction(async (trx) => {
      const tx = trx as unknown as Tx;
      const { item, movement } = await ItemsService.applyMovement(tx, {
        propertyId,
        itemId,
        type: dto.type,
        qty: dto.qty,
        reason: dto.reason ?? null,
        createdBy: dto.createdBy ?? null,
      });
      return { item: ItemsService.toDto(item), movement: ItemsService.movementToDto(movement) };
    });
  }

  async listMovements(propertyId: string, params: MovementFilterDto = {}) {
    const conds: SQL[] = [eq(stockMovements.propertyId, propertyId)];
    if (params.itemId) conds.push(eq(stockMovements.itemId, params.itemId));
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;

    const rows = await this.db
      .select()
      .from(stockMovements)
      .where(and(...conds))
      .orderBy(desc(stockMovements.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(stockMovements)
      .where(and(...conds));

    return { items: rows.map(ItemsService.movementToDto), total: count, limit, offset };
  }

  /**
   * The single choke point that changes on-hand. Locks the item row, validates
   * the resulting balance stays non-negative, writes the movement and the new
   * quantity together. Reused by PO-receive so a received order's IN movements
   * run through exactly the same guard.
   */
  static async applyMovement(
    tx: Tx,
    input: ApplyMovementInput,
  ): Promise<{ item: InventoryItem; movement: StockMovement }> {
    const [item] = await tx
      .select()
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.id, input.itemId),
          eq(inventoryItems.propertyId, input.propertyId),
          isNull(inventoryItems.deletedAt),
        ),
      )
      .for('update')
      .limit(1);
    if (!item) throw InventoryErrors.itemNotFound();

    const delta = stockDelta(input.type, input.qty);
    if (input.type === 'ADJUST' && delta === 0) throw InventoryErrors.zeroAdjustment();
    if (!stockStaysNonNegative(item.currentQty, delta))
      throw InventoryErrors.negativeStock(item.name);

    const balanceAfter = item.currentQty + delta;
    const [updated] = await tx
      .update(inventoryItems)
      .set({ currentQty: balanceAfter, updatedAt: new Date() })
      .where(eq(inventoryItems.id, item.id))
      .returning();

    const [movement] = await tx
      .insert(stockMovements)
      .values({
        propertyId: input.propertyId,
        itemId: item.id,
        type: input.type,
        qty: Math.abs(input.qty),
        qtyDelta: delta,
        balanceAfter,
        reason: input.reason ?? null,
        purchaseOrderId: input.purchaseOrderId ?? null,
        createdBy: input.createdBy ?? null,
      })
      .returning();

    return { item: updated, movement };
  }
}

export interface CreateMovementInput {
  type: StockMovementType;
  qty: number;
  reason?: string | null;
  createdBy?: string | null;
}
