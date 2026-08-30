import { Inject, Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, gte, sql, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  reservations,
  spaAppointments,
  spaBills,
  type SpaBill,
  type SpaPaymentMethod,
} from '../../database/schema';
import { RefundBillDto, SettleBillDto } from './dto';
import { SpaErrors } from './spa-errors';
import {
  assertBillTransition,
  computeSpaBill,
  isBillable,
  resolveSpaTaxPercent,
} from './spa-rules';
import { type Tx } from './services.service';
import { FolioService } from '../folio/folio.service';

const MAX_LIMIT = 200;

/**
 * Spa bills — where a completed appointment becomes money taken.
 *
 * The rules that run through every method:
 *  1. TENANT ISOLATION. A bill, an appointment, a reservation is only ever
 *     resolved by (id, propertyId = the caller's own). Cross-property 404s.
 *  2. THE BILL IS COMPUTED FROM THE APPOINTMENT SNAPSHOT, never the live
 *     service — the same correctness rule the restaurant enforces on order
 *     lines. A service repriced next week never rewrites a bill already raised.
 *  3. ROOM_CHARGE is validated against a CHECKED_IN reservation at THIS
 *     property before it can settle a bill, exactly as the restaurant does.
 *  4. ONE STATE MACHINE, in spa-rules.ts: UNPAID → PAID → REFUNDED.
 */
@Injectable()
export class SpaBillsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly config: ConfigService,
    private readonly folio: FolioService,
  ) {}

  private taxPercent(): number {
    return resolveSpaTaxPercent(this.config.get<number>('SPA_TAX_PERCENT'));
  }

  static toDto(b: SpaBill) {
    return {
      id: b.id,
      propertyId: b.propertyId,
      appointmentId: b.appointmentId,
      subtotalPaise: b.subtotalPaise,
      taxPaise: b.taxPaise,
      totalPaise: b.totalPaise,
      status: b.status,
      paymentMethod: b.paymentMethod,
      reservationId: b.reservationId,
      settledBy: b.settledBy,
      refundReason: b.refundReason,
      paidAt: b.paidAt,
      refundedAt: b.refundedAt,
      createdAt: b.createdAt,
      updatedAt: b.updatedAt,
    };
  }

  async requireBill(propertyId: string, id: string, tx: Tx = this.db): Promise<SpaBill> {
    const [row] = await tx
      .select()
      .from(spaBills)
      .where(and(eq(spaBills.id, id), eq(spaBills.propertyId, propertyId)))
      .limit(1);
    if (!row) throw SpaErrors.billNotFound();
    return row;
  }

  async list(propertyId: string, status?: string, limit = 50, offset = 0) {
    const capped = Math.min(limit, MAX_LIMIT);
    const conds: SQL[] = [eq(spaBills.propertyId, propertyId)];
    if (status) conds.push(eq(spaBills.status, status as SpaBill['status']));
    const where = and(...conds);
    const rows = await this.db
      .select()
      .from(spaBills)
      .where(where)
      .orderBy(desc(spaBills.createdAt))
      .limit(capped)
      .offset(offset);
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(spaBills)
      .where(where);
    return { items: rows.map(SpaBillsService.toDto), total: count, limit: capped, offset };
  }

  /**
   * Raise a bill for a COMPLETED appointment. Totals are computed from the
   * appointment's price SNAPSHOT and frozen on the bill. One bill per
   * appointment (unique index + in-tx check).
   */
  async createForAppointment(propertyId: string, appointmentId: string) {
    return this.db.transaction(async (trx) => {
      const tx = trx as unknown as Tx;
      const [appt] = await tx
        .select()
        .from(spaAppointments)
        .where(
          and(eq(spaAppointments.id, appointmentId), eq(spaAppointments.propertyId, propertyId)),
        )
        .limit(1);
      if (!appt) throw SpaErrors.appointmentNotFound();
      if (!isBillable(appt.status)) throw SpaErrors.notBillable();

      const existing = await tx
        .select({ id: spaBills.id })
        .from(spaBills)
        .where(eq(spaBills.appointmentId, appointmentId))
        .limit(1);
      if (existing.length > 0) throw SpaErrors.billExists();

      const totals = computeSpaBill(appt.pricePaiseSnapshot, this.taxPercent());
      try {
        const [created] = await tx
          .insert(spaBills)
          .values({
            propertyId,
            appointmentId,
            subtotalPaise: totals.subtotalPaise,
            taxPaise: totals.taxPaise,
            totalPaise: totals.totalPaise,
          })
          .returning();
        return SpaBillsService.toDto(created);
      } catch (err) {
        if ((err as { code?: string }).code === '23505') throw SpaErrors.billExists();
        throw err;
      }
    });
  }

  async settle(
    propertyId: string,
    id: string,
    dto: SettleBillDto,
    settledByStaffId: string | null,
  ) {
    return this.db.transaction(async (trx) => {
      const tx = trx as unknown as Tx;
      const bill = await this.requireBill(propertyId, id, tx);
      if (bill.status !== 'UNPAID') throw SpaErrors.billNotUnpaid();
      assertBillTransition(bill.status, 'PAID');

      let reservationId: string | null = null;
      if (dto.method === 'ROOM_CHARGE') {
        if (!dto.reservationId) throw SpaErrors.reservationRequired();
        const [res] = await tx
          .select({ id: reservations.id, status: reservations.status })
          .from(reservations)
          .where(
            and(eq(reservations.id, dto.reservationId), eq(reservations.propertyId, propertyId)),
          )
          .limit(1);
        if (!res || res.status !== 'CHECKED_IN') throw SpaErrors.reservationNotInHouse();
        reservationId = res.id;
      }

      const [row] = await tx
        .update(spaBills)
        .set({
          status: 'PAID',
          paymentMethod: dto.method as SpaPaymentMethod,
          reservationId,
          settledBy: settledByStaffId,
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(eq(spaBills.id, id), eq(spaBills.propertyId, propertyId)))
        .returning();

      // ROOM_CHARGE now POSTS to the guest folio (same rule the restaurant
      // follows), so the spa charge rides the stay balance to checkout.
      // Idempotent by (source, billId): a retried settle never double-charges.
      if (reservationId) {
        const [appt] = await tx
          .select({ name: spaAppointments.serviceNameSnapshot })
          .from(spaAppointments)
          .where(eq(spaAppointments.id, bill.appointmentId))
          .limit(1);
        await this.folio.postCharge(
          {
            reservationId,
            propertyId,
            kind: 'SPA',
            description: appt?.name ? `Spa — ${appt.name}` : 'Spa services',
            amountPaise: bill.totalPaise,
            sourceType: 'spa_bill',
            sourceId: bill.id,
            postedBy: settledByStaffId,
          },
          tx,
        );
      }
      return { before: bill, after: SpaBillsService.toDto(row) };
    });
  }

  /** Record-only refund: PAID → REFUNDED. The money moved back outside the app. */
  async refund(propertyId: string, id: string, dto: RefundBillDto) {
    const bill = await this.requireBill(propertyId, id);
    if (bill.status !== 'PAID') throw SpaErrors.billNotPaid();
    assertBillTransition(bill.status, 'REFUNDED');
    const [row] = await this.db
      .update(spaBills)
      .set({
        status: 'REFUNDED',
        refundReason: dto.reason,
        refundedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(spaBills.id, id), eq(spaBills.propertyId, propertyId)))
      .returning();
    return { before: bill, after: SpaBillsService.toDto(row) };
  }

  /** Revenue summary since a day boundary: PAID totals by method, refund total. */
  async revenue(propertyId: string, since: Date) {
    const paid = await this.db
      .select({
        method: spaBills.paymentMethod,
        count: sql<number>`count(*)::int`,
        revenue: sql<number>`coalesce(sum(${spaBills.totalPaise}), 0)::int`,
      })
      .from(spaBills)
      .where(
        and(
          eq(spaBills.propertyId, propertyId),
          eq(spaBills.status, 'PAID'),
          gte(spaBills.paidAt, since),
        ),
      )
      .groupBy(spaBills.paymentMethod);

    let revenuePaise = 0;
    let paidCount = 0;
    const methodBreakdown: Record<string, { count: number; revenuePaise: number }> = {};
    for (const row of paid) {
      revenuePaise += row.revenue;
      paidCount += row.count;
      if (row.method) methodBreakdown[row.method] = { count: row.count, revenuePaise: row.revenue };
    }

    const [refundRow] = await this.db
      .select({
        count: sql<number>`count(*)::int`,
        total: sql<number>`coalesce(sum(${spaBills.totalPaise}), 0)::int`,
      })
      .from(spaBills)
      .where(
        and(
          eq(spaBills.propertyId, propertyId),
          eq(spaBills.status, 'REFUNDED'),
          gte(spaBills.refundedAt, since),
        ),
      );

    return {
      revenuePaise,
      paidCount,
      methodBreakdown,
      refundedCount: refundRow?.count ?? 0,
      refundedPaise: refundRow?.total ?? 0,
    };
  }
}
