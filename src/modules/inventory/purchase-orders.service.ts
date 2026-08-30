import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, SQL, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  inventoryItems,
  purchaseOrders,
  suppliers,
  type PurchaseOrder,
  type PurchaseOrderStatus,
} from '../../database/schema';
import { CreatePoDto, PoFilterDto, PoLineDto, UpdatePoDto } from './dto';
import { InventoryErrors } from './inventory-errors';
import {
  assertPoTransition,
  computePoTotals,
  formatPoNumber,
  poIsEditable,
  type PoLineInput,
} from './inventory-rules';
import { ItemsService, type Tx } from './items.service';

/**
 * Purchase orders, per property. A PO is one row with its lines in jsonb; each
 * line snapshots the item name/unit at order time. Receiving a SENT order turns
 * every line into an IN stock movement — all in ONE transaction, so a partial
 * receive can never leave stock and the order out of step.
 */
@Injectable()
export class PurchaseOrdersService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  static toDto(p: PurchaseOrder) {
    return {
      id: p.id,
      propertyId: p.propertyId,
      poNumber: p.poNumber,
      supplierId: p.supplierId,
      supplierName: p.supplierName,
      status: p.status,
      lines: p.lines,
      totalPaise: p.totalPaise,
      note: p.note,
      receivedAt: p.receivedAt,
      createdBy: p.createdBy,
      createdAt: p.createdAt,
      updatedAt: p.updatedAt,
    };
  }

  async requirePo(propertyId: string, id: string, tx: Tx = this.db): Promise<PurchaseOrder> {
    const [row] = await tx
      .select()
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.id, id),
          eq(purchaseOrders.propertyId, propertyId),
          isNull(purchaseOrders.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw InventoryErrors.poNotFound();
    return row;
  }

  async list(propertyId: string, params: PoFilterDto = {}) {
    const conds: SQL[] = [
      eq(purchaseOrders.propertyId, propertyId),
      isNull(purchaseOrders.deletedAt),
    ];
    if (params.status) conds.push(eq(purchaseOrders.status, params.status as PurchaseOrderStatus));
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;

    const rows = await this.db
      .select()
      .from(purchaseOrders)
      .where(and(...conds))
      .orderBy(desc(purchaseOrders.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(purchaseOrders)
      .where(and(...conds));

    return { items: rows.map(PurchaseOrdersService.toDto), total: count, limit, offset };
  }

  async get(propertyId: string, id: string) {
    return PurchaseOrdersService.toDto(await this.requirePo(propertyId, id));
  }

  /** Resolve each PO line's item within the property, snapshotting name/unit. */
  private async resolveLines(
    propertyId: string,
    lines: PoLineDto[],
    tx: Tx,
  ): Promise<PoLineInput[]> {
    const items = new ItemsService(this.db);
    const out: PoLineInput[] = [];
    for (const l of lines) {
      // eslint-disable-next-line no-await-in-loop
      const item = await items.requireItem(propertyId, l.itemId, tx);
      out.push({
        itemId: item.id,
        nameSnapshot: item.name,
        unitSnapshot: item.unit,
        qty: l.qty,
        unitPricePaise: l.unitPricePaise,
      });
    }
    return out;
  }

  private async resolveSupplierName(
    propertyId: string,
    supplierId: string | undefined,
    fallback: string | undefined,
    tx: Tx,
  ): Promise<string | null> {
    if (supplierId) {
      const [row] = await tx
        .select()
        .from(suppliers)
        .where(
          and(
            eq(suppliers.id, supplierId),
            eq(suppliers.propertyId, propertyId),
            isNull(suppliers.deletedAt),
          ),
        )
        .limit(1);
      if (!row) throw InventoryErrors.supplierNotFound();
      return row.name;
    }
    return fallback?.trim() || null;
  }

  async create(propertyId: string, dto: CreatePoDto, createdBy: string) {
    if (!dto.lines?.length) throw InventoryErrors.emptyPo();
    return this.db.transaction(async (trx) => {
      const tx = trx as unknown as Tx;
      const resolvedLines = await this.resolveLines(propertyId, dto.lines, tx);
      const { lines, totalPaise } = computePoTotals(resolvedLines);
      const supplierName = await this.resolveSupplierName(
        propertyId,
        dto.supplierId,
        dto.supplierName,
        tx,
      );

      // Per-property PO number from a count; retry on the rare unique clash.
      for (let attempt = 0; attempt < 5; attempt += 1) {
        const [{ count }] = await tx
          .select({ count: sql<number>`count(*)::int` })
          .from(purchaseOrders)
          .where(eq(purchaseOrders.propertyId, propertyId));
        try {
          const [row] = await tx
            .insert(purchaseOrders)
            .values({
              propertyId,
              poNumber: formatPoNumber((count ?? 0) + 1 + attempt),
              supplierId: dto.supplierId ?? null,
              supplierName,
              status: 'DRAFT',
              lines,
              totalPaise,
              note: dto.note?.trim() || null,
              createdBy,
            })
            .returning();
          return PurchaseOrdersService.toDto(row);
        } catch (err) {
          if ((err as { code?: string }).code === '23505') continue;
          throw err;
        }
      }
      throw InventoryErrors.poNotFound();
    });
  }

  async update(propertyId: string, id: string, dto: UpdatePoDto) {
    return this.db.transaction(async (trx) => {
      const tx = trx as unknown as Tx;
      const before = await this.requirePo(propertyId, id, tx);
      if (!poIsEditable(before.status)) throw InventoryErrors.poNotEditable();

      const patch: Partial<typeof purchaseOrders.$inferInsert> = { updatedAt: new Date() };
      if (dto.note !== undefined) patch.note = dto.note.trim() || null;
      if (dto.supplierId !== undefined || dto.supplierName !== undefined) {
        patch.supplierId = dto.supplierId ?? null;
        patch.supplierName = await this.resolveSupplierName(
          propertyId,
          dto.supplierId,
          dto.supplierName,
          tx,
        );
      }
      if (dto.lines !== undefined) {
        if (!dto.lines.length) throw InventoryErrors.emptyPo();
        const resolved = await this.resolveLines(propertyId, dto.lines, tx);
        const { lines, totalPaise } = computePoTotals(resolved);
        patch.lines = lines;
        patch.totalPaise = totalPaise;
      }

      const [after] = await tx
        .update(purchaseOrders)
        .set(patch)
        .where(eq(purchaseOrders.id, id))
        .returning();
      return {
        before: PurchaseOrdersService.toDto(before),
        after: PurchaseOrdersService.toDto(after),
      };
    });
  }

  /** DRAFT → SENT, or DRAFT/SENT → CANCELLED. Receiving is its own method. */
  async setStatus(propertyId: string, id: string, to: 'SENT' | 'CANCELLED') {
    const before = await this.requirePo(propertyId, id);
    assertPoTransition(before.status, to);
    const [after] = await this.db
      .update(purchaseOrders)
      .set({ status: to, updatedAt: new Date() })
      .where(eq(purchaseOrders.id, id))
      .returning();
    return {
      before: PurchaseOrdersService.toDto(before),
      after: PurchaseOrdersService.toDto(after),
    };
  }

  /**
   * Receive a SENT order: mark it RECEIVED and create an IN stock movement for
   * each line, adjusting on-hand — all in one transaction.
   */
  async receive(propertyId: string, id: string, receivedBy: string) {
    return this.db.transaction(async (trx) => {
      const tx = trx as unknown as Tx;
      const before = await this.requirePo(propertyId, id, tx);
      if (before.status !== 'SENT') throw InventoryErrors.poNotReceivable();
      assertPoTransition(before.status, 'RECEIVED');

      for (const line of before.lines) {
        // eslint-disable-next-line no-await-in-loop
        await ItemsService.applyMovement(tx, {
          propertyId,
          itemId: line.itemId,
          type: 'IN',
          qty: line.qty,
          reason: `Received ${before.poNumber}`,
          purchaseOrderId: before.id,
          createdBy: receivedBy,
        });
        // Last-purchase-cost basis: value future on-hand at what we just paid.
        // eslint-disable-next-line no-await-in-loop
        await tx
          .update(inventoryItems)
          .set({ unitCostPaise: line.unitPricePaise, updatedAt: new Date() })
          .where(eq(inventoryItems.id, line.itemId));
      }

      const [after] = await tx
        .update(purchaseOrders)
        .set({ status: 'RECEIVED', receivedAt: new Date(), updatedAt: new Date() })
        .where(eq(purchaseOrders.id, id))
        .returning();
      return {
        before: PurchaseOrdersService.toDto(before),
        after: PurchaseOrdersService.toDto(after),
      };
    });
  }

  async pendingCount(propertyId: string): Promise<number> {
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(purchaseOrders)
      .where(
        and(
          eq(purchaseOrders.propertyId, propertyId),
          isNull(purchaseOrders.deletedAt),
          sql`${purchaseOrders.status} IN ('DRAFT','SENT')`,
        ),
      );
    return count ?? 0;
  }
}
