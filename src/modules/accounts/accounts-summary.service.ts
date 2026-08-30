import { Inject, Injectable } from '@nestjs/common';
import { and, eq, gte, lt, ne, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { expenses, reservations, restaurantOrders } from '../../database/schema';

/**
 * The read-heavy finance view for a property. Everything here is READ-ONLY: room
 * revenue is rolled up from `reservations`, F&B revenue from paid
 * `restaurant_orders`, and neither is ever mutated by the accounts surface.
 *
 * "Today" is the server-local calendar day. Room revenue is recognised at
 * CHECK-IN (a reservation checked in today), F&B revenue at settlement (an order
 * paid today) — the two moments the money is actually realised on site.
 */
@Injectable()
export class AccountsSummaryService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  private static dayWindow(now = new Date()): { start: Date; end: Date } {
    const start = new Date(now);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  async summary(propertyId: string) {
    const { start, end } = AccountsSummaryService.dayWindow();

    // --- Room revenue: reservations checked in today (excluding cancelled). ---
    const [rooms] = await this.db
      .select({ total: sql<number>`coalesce(sum(${reservations.totalPaise}), 0)::int` })
      .from(reservations)
      .where(
        and(
          eq(reservations.propertyId, propertyId),
          ne(reservations.status, 'CANCELLED'),
          gte(reservations.checkedInAt, start),
          lt(reservations.checkedInAt, end),
        ),
      );

    // --- F&B revenue: restaurant orders settled (paid) today. ---
    const [fnb] = await this.db
      .select({ total: sql<number>`coalesce(sum(${restaurantOrders.totalPaise}), 0)::int` })
      .from(restaurantOrders)
      .where(
        and(
          eq(restaurantOrders.propertyId, propertyId),
          eq(restaurantOrders.status, 'PAID'),
          gte(restaurantOrders.paidAt, start),
          lt(restaurantOrders.paidAt, end),
        ),
      );

    // --- Expenses incurred today (across all statuses). ---
    const [expensesToday] = await this.db
      .select({ total: sql<number>`coalesce(sum(${expenses.amountPaise}), 0)::int` })
      .from(expenses)
      .where(
        and(
          eq(expenses.propertyId, propertyId),
          sql`${expenses.deletedAt} IS NULL`,
          gte(expenses.incurredOn, start),
          lt(expenses.incurredOn, end),
        ),
      );

    // --- Receivables: reservations with a balance still due. ---
    const [receivables] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(reservations)
      .where(
        and(
          eq(reservations.propertyId, propertyId),
          ne(reservations.status, 'CANCELLED'),
          sql`${reservations.paidPaise} < ${reservations.totalPaise}`,
        ),
      );

    // --- Payables: expenses not yet paid (DRAFT or APPROVED). ---
    const [payables] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(expenses)
      .where(
        and(
          eq(expenses.propertyId, propertyId),
          sql`${expenses.deletedAt} IS NULL`,
          ne(expenses.status, 'PAID'),
        ),
      );

    const roomsPaise = rooms?.total ?? 0;
    const fnbPaise = fnb?.total ?? 0;

    return {
      date: start,
      revenue: {
        roomsPaise,
        fnbPaise,
        totalPaise: roomsPaise + fnbPaise,
      },
      expensesTodayPaise: expensesToday?.total ?? 0,
      receivablesCount: receivables?.count ?? 0,
      payablesCount: payables?.count ?? 0,
    };
  }
}
