import { BadRequestException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, gte, isNull, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { cashEntries, staffShifts, type CashEntryKind } from '../../database/schema';

type Tx = Pick<Database, 'select' | 'insert' | 'update'>;

/** Which kinds add to the drawer and which take from it. */
const INFLOW: ReadonlySet<CashEntryKind> = new Set(['FOLIO_CASH', 'POS_CASH', 'CASH_IN', 'TOP_UP']);

/**
 * The cash tracker and shifts.
 *
 * Every rupee of cash that moves is a row: cash from a folio, cash at the
 * till, a manual cash-in, an owner's withdrawal, a top-up, a cash expense.
 * Cash-in-hand is a signed sum, so it is always derivable and never drifts.
 * A shift opens with a float and closes with what the cashier declares; the
 * difference against the expected sum is the handover figure.
 */
@Injectable()
export class CashService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  static signed(kind: CashEntryKind, amountPaise: number): number {
    return INFLOW.has(kind) ? amountPaise : -amountPaise;
  }

  /** Record a movement. Attached to the recorder's open shift when there is one. */
  async record(
    e: {
      propertyId: string;
      kind: CashEntryKind;
      amountPaise: number;
      reservationId?: string | null;
      orderId?: string | null;
      expenseId?: string | null;
      note?: string | null;
      recordedBy?: string | null;
    },
    tx: Tx = this.db,
  ) {
    if (e.amountPaise <= 0) throw new BadRequestException('Amount must be positive');
    const shift = e.recordedBy ? await this.openShiftFor(e.propertyId, e.recordedBy, tx) : null;
    const [row] = await tx
      .insert(cashEntries)
      .values({
        propertyId: e.propertyId,
        shiftId: shift?.id ?? null,
        kind: e.kind,
        amountPaise: e.amountPaise,
        reservationId: e.reservationId ?? null,
        orderId: e.orderId ?? null,
        expenseId: e.expenseId ?? null,
        note: e.note ?? null,
        recordedBy: e.recordedBy ?? null,
      })
      .returning();
    return row;
  }

  async balancePaise(propertyId: string, tx: Tx = this.db): Promise<number> {
    const [r] = await tx
      .select({
        sum: sql<number>`coalesce(sum(case when ${cashEntries.kind} in ('FOLIO_CASH','POS_CASH','CASH_IN','TOP_UP') then ${cashEntries.amountPaise} else -${cashEntries.amountPaise} end), 0)::int`,
      })
      .from(cashEntries)
      .where(eq(cashEntries.propertyId, propertyId));
    return Number(r?.sum ?? 0);
  }

  async entries(propertyId: string, q: { days?: number; limit?: number }) {
    const since = new Date(Date.now() - (q.days ?? 7) * 86_400_000);
    const rows = await this.db
      .select()
      .from(cashEntries)
      .where(and(eq(cashEntries.propertyId, propertyId), gte(cashEntries.createdAt, since)))
      .orderBy(desc(cashEntries.createdAt))
      .limit(Math.min(q.limit ?? 200, 1000));
    return {
      balancePaise: await this.balancePaise(propertyId),
      items: rows.map((r) => ({ ...r, signedPaise: CashService.signed(r.kind, r.amountPaise) })),
    };
  }

  // -------------------------------------------------------------- shifts --

  async openShiftFor(propertyId: string, staffId: string, tx: Tx = this.db) {
    const [row] = await tx
      .select()
      .from(staffShifts)
      .where(
        and(
          eq(staffShifts.propertyId, propertyId),
          eq(staffShifts.staffId, staffId),
          isNull(staffShifts.closedAt),
        ),
      )
      .limit(1);
    return row ?? null;
  }

  async openShift(propertyId: string, staffId: string, openingCashPaise: number, note?: string) {
    if (await this.openShiftFor(propertyId, staffId))
      throw new BadRequestException({
        error: 'SHIFT_ALREADY_OPEN',
        message: 'You already have an open shift',
      });
    const [row] = await this.db
      .insert(staffShifts)
      .values({ propertyId, staffId, openingCashPaise, note: note ?? null })
      .returning();
    return row;
  }

  /** Close with the declared count; expected = opening + this shift's cash movements. */
  async closeShift(propertyId: string, staffId: string, declaredCashPaise: number, note?: string) {
    const shift = await this.openShiftFor(propertyId, staffId);
    if (!shift)
      throw new NotFoundException({ error: 'NO_OPEN_SHIFT', message: 'No open shift to close' });
    const [m] = await this.db
      .select({
        sum: sql<number>`coalesce(sum(case when ${cashEntries.kind} in ('FOLIO_CASH','POS_CASH','CASH_IN','TOP_UP') then ${cashEntries.amountPaise} else -${cashEntries.amountPaise} end), 0)::int`,
      })
      .from(cashEntries)
      .where(eq(cashEntries.shiftId, shift.id));
    const expected = shift.openingCashPaise + Number(m?.sum ?? 0);
    const [row] = await this.db
      .update(staffShifts)
      .set({
        closedAt: new Date(),
        declaredCashPaise,
        expectedCashPaise: expected,
        note: note ?? shift.note,
      })
      .where(eq(staffShifts.id, shift.id))
      .returning();
    return { ...row, differencePaise: declaredCashPaise - expected };
  }

  shifts(propertyId: string, limit = 50) {
    return this.db
      .select()
      .from(staffShifts)
      .where(eq(staffShifts.propertyId, propertyId))
      .orderBy(desc(staffShifts.openedAt))
      .limit(limit);
  }
}
