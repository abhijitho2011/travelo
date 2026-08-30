import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gt, inArray, isNull, lte, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { expenses, inventoryItems, purchaseOrders, workOrders } from '../../database/schema';

export interface OperationalAlertDto {
  id: string;
  title: string;
  count: number;
  severity: 'critical' | 'warning' | 'healthy' | 'neutral';
  detail?: string;
  route?: string;
}

/**
 * The management dashboard's alert strip — the `GET /dashboard/alerts` the app
 * called into a 404. Each alert is a real count the GM can act on, computed
 * per property, and only surfaced when its count is non-zero so the strip is
 * quiet when the hotel is.
 */
@Injectable()
export class AlertsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list(propertyId: string): Promise<OperationalAlertDto[]> {
    const [pending, lowStock, openWo] = await Promise.all([
      this.pendingApprovals(propertyId),
      this.lowStock(propertyId),
      this.openWorkOrders(propertyId),
    ]);

    const alerts: OperationalAlertDto[] = [];
    if (pending > 0) {
      alerts.push({
        id: 'approvals',
        title: 'Approvals waiting',
        count: pending,
        severity: 'warning',
        detail: 'Expenses and purchase orders need your sign-off.',
        route: '/management/approvals',
      });
    }
    if (lowStock > 0) {
      alerts.push({
        id: 'low_stock',
        title: 'Low stock items',
        count: lowStock,
        severity: 'warning',
        detail: 'Items at or below their reorder level.',
        route: '/inventory',
      });
    }
    if (openWo > 0) {
      alerts.push({
        id: 'work_orders',
        title: 'Open work orders',
        count: openWo,
        severity: 'neutral',
        detail: 'Maintenance jobs not yet completed.',
        route: '/maintenance',
      });
    }
    return alerts;
  }

  private async pendingApprovals(propertyId: string): Promise<number> {
    const [[e], [p]] = await Promise.all([
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(expenses)
        .where(
          and(eq(expenses.propertyId, propertyId), eq(expenses.status, 'DRAFT'), isNull(expenses.deletedAt)),
        ),
      this.db
        .select({ n: sql<number>`count(*)::int` })
        .from(purchaseOrders)
        .where(
          and(
            eq(purchaseOrders.propertyId, propertyId),
            eq(purchaseOrders.status, 'DRAFT'),
            isNull(purchaseOrders.deletedAt),
          ),
        ),
    ]);
    return (e?.n ?? 0) + (p?.n ?? 0);
  }

  private async lowStock(propertyId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(inventoryItems)
      .where(
        and(
          eq(inventoryItems.propertyId, propertyId),
          isNull(inventoryItems.deletedAt),
          gt(inventoryItems.reorderLevel, 0),
          lte(inventoryItems.currentQty, inventoryItems.reorderLevel),
        ),
      );
    return row?.n ?? 0;
  }

  private async openWorkOrders(propertyId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(workOrders)
      .where(
        and(
          eq(workOrders.propertyId, propertyId),
          inArray(workOrders.status, ['OPEN', 'ACCEPTED', 'IN_PROGRESS', 'PAUSED']),
        ),
      );
    return row?.n ?? 0;
  }
}
