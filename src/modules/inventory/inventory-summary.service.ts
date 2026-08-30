import { Inject, Injectable } from '@nestjs/common';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { inventoryItems, purchaseOrders } from '../../database/schema';

/** The store dashboard: stock value, low-stock count and pending POs. */
@Injectable()
export class InventorySummaryService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async summary(propertyId: string) {
    const [items] = await this.db
      .select({
        itemCount: sql<number>`count(*)::int`,
        unitsOnHand: sql<number>`coalesce(sum(${inventoryItems.currentQty}), 0)::int`,
        stockValuePaise: sql<number>`coalesce(sum(${inventoryItems.currentQty} * ${inventoryItems.unitCostPaise}), 0)::int`,
        lowStockCount: sql<number>`coalesce(sum(case when ${inventoryItems.currentQty} <= ${inventoryItems.reorderLevel} then 1 else 0 end), 0)::int`,
      })
      .from(inventoryItems)
      .where(and(eq(inventoryItems.propertyId, propertyId), isNull(inventoryItems.deletedAt)));

    const [pos] = await this.db
      .select({
        pendingCount: sql<number>`coalesce(sum(case when ${purchaseOrders.status} IN ('DRAFT','SENT') then 1 else 0 end), 0)::int`,
      })
      .from(purchaseOrders)
      .where(and(eq(purchaseOrders.propertyId, propertyId), isNull(purchaseOrders.deletedAt)));

    return {
      itemCount: items?.itemCount ?? 0,
      unitsOnHand: items?.unitsOnHand ?? 0,
      stockValuePaise: items?.stockValuePaise ?? 0,
      lowStockCount: items?.lowStockCount ?? 0,
      pendingPoCount: pos?.pendingCount ?? 0,
    };
  }
}
