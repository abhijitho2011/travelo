import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  folioEvents,
  folioLineItems,
  folioPayments,
  propertySettings,
  propertyTaxes,
  reservations,
  type FolioLineKind,
  type FolioPaymentDirection,
  type FolioPaymentMethod,
  type PropertyTax,
} from '../../database/schema';
import { computeGstForCategory, type GstCategory } from '../billing/gst';
import { nightsBetween } from '../reservations/reservation-rules';

/** The subset of the Drizzle client a folio write needs — `this.db` or a tx. */
export type FolioTx = Pick<Database, 'select' | 'insert' | 'update'>;

export interface PostChargeInput {
  reservationId: string;
  propertyId: string;
  kind: FolioLineKind;
  description: string;
  amountPaise: number;
  /** With `sourceId`, the idempotency key: the same source posts at most once. */
  sourceType?: string | null;
  sourceId?: string | null;
  postedBy?: string | null;
  quantity?: number;
  /** Statutory treatment. Defaults from `kind`: RESTAURANT→restaurant, else other. */
  taxCategory?: GstCategory;
  taxExempt?: boolean;
  hsnCode?: string | null;
}

export interface RecordPaymentInput {
  reservationId: string;
  propertyId: string;
  method: FolioPaymentMethod;
  amountPaise: number;
  direction?: FolioPaymentDirection;
  reference?: string | null;
  note?: string | null;
  collectedBy?: string | null;
  /** A repeat with the same key (per reservation) is a no-op returning the first row. */
  idempotencyKey?: string | null;
}

export interface FolioSummary {
  reservationId: string;
  roomChargePaise: number;
  /** GST on the room, slab chosen on the NIGHTLY tariff, plus property taxes. */
  roomTaxPaise: number;
  roomTaxRatePercent: number;
  ancillaryPaise: number;
  /** Sum of tax already computed and stored on each live line. */
  lineTaxPaise: number;
  /** Hotel-defined taxes/fees (municipal, service charge…) on the room. */
  propertyTaxPaise: number;
  taxPaise: number;
  /** Pre-tax charges. */
  subtotalPaise: number;
  /** Subtotal + tax — what the guest owes before payments. */
  chargesPaise: number;
  intraState: boolean;
  paymentsPaise: number;
  refundsPaise: number;
  netPaidPaise: number;
  balancePaise: number;
  lineItems: (typeof folioLineItems.$inferSelect)[];
  payments: (typeof folioPayments.$inferSelect)[];
}

/**
 * The one place that reads and writes a stay's folio.
 *
 * Every method accepts an optional transaction handle so a restaurant/spa
 * settle or a checkout can post to the folio inside its own transaction; called
 * without one it uses the pooled client. The reservation's `paid_paise` is kept
 * as a denormalised cache of net payments so existing list/detail code that
 * reads it stays correct — but the AUTHORITATIVE balance is always recomputed
 * from the rows here.
 */
@Injectable()
export class FolioService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /**
   * Posts one ancillary charge to the folio. Idempotent when `sourceType` +
   * `sourceId` are given: a restaurant order settled on ROOM_CHARGE lands on the
   * folio exactly once, so a retried settle never double-charges the guest.
   * Returns the line (existing or newly inserted).
   */
  async postCharge(
    input: PostChargeInput,
    tx: FolioTx = this.db,
  ): Promise<typeof folioLineItems.$inferSelect> {
    const hasSource = !!(input.sourceType && input.sourceId);
    if (hasSource) {
      const existing = await this.findLineBySource(input.sourceType!, input.sourceId!, tx);
      if (existing) return existing;
    }
    // Tax is decided when the line is posted and STORED, so a later change to
    // the property's registration cannot silently re-tax yesterday's dinner.
    const category = input.taxCategory ?? FolioService.categoryFor(input.kind);
    const intraState = await this.intraStateFor(input.reservationId, tx);
    const exempt = !!input.taxExempt || input.kind === 'ADJUSTMENT';
    const gst = exempt
      ? { taxPaise: 0, ratePercent: 0, hsnCode: input.hsnCode ?? null }
      : computeGstForCategory({ category, taxableAmountPaise: input.amountPaise, intraState });
    const [row] = await tx
      .insert(folioLineItems)
      .values({
        reservationId: input.reservationId,
        propertyId: input.propertyId,
        kind: input.kind,
        description: input.description,
        amountPaise: input.amountPaise,
        quantity: input.quantity ?? 1,
        taxPaise: gst.taxPaise,
        taxRateBp: Math.round(gst.ratePercent * 100),
        taxCategory: category,
        taxExempt: exempt,
        hsnCode: input.hsnCode ?? gst.hsnCode ?? null,
        sourceType: input.sourceType ?? null,
        sourceId: input.sourceId ?? null,
        postedBy: input.postedBy ?? null,
      })
      .onConflictDoNothing()
      .returning();
    // Lost the race on the partial-unique source index — read the winner back.
    if (!row && hasSource) {
      const existing = await this.findLineBySource(input.sourceType!, input.sourceId!, tx);
      if (existing) return existing;
    }
    return row;
  }

  /**
   * Records a payment (or refund) against the folio and refreshes the
   * reservation's cached `paid_paise`. Idempotent per `idempotencyKey`: a
   * double-tapped settle returns the first payment untouched.
   */
  async recordPayment(
    input: RecordPaymentInput,
    tx: FolioTx = this.db,
  ): Promise<{ payment: typeof folioPayments.$inferSelect; netPaidPaise: number }> {
    if (input.idempotencyKey) {
      const existing = await this.findPaymentByKey(input.reservationId, input.idempotencyKey, tx);
      if (existing) {
        const net = await this.netPaid(input.reservationId, tx);
        return { payment: existing, netPaidPaise: net };
      }
    }
    const [inserted] = await tx
      .insert(folioPayments)
      .values({
        reservationId: input.reservationId,
        propertyId: input.propertyId,
        direction: input.direction ?? 'PAYMENT',
        method: input.method,
        amountPaise: input.amountPaise,
        reference: input.reference ?? null,
        note: input.note ?? null,
        collectedBy: input.collectedBy ?? null,
        idempotencyKey: input.idempotencyKey ?? null,
      })
      .onConflictDoNothing()
      .returning();

    // Lost the idempotency race — return the row the winner wrote.
    const payment =
      inserted ??
      (input.idempotencyKey
        ? await this.findPaymentByKey(input.reservationId, input.idempotencyKey, tx)
        : undefined);
    if (!payment) {
      // No idempotency key and the insert somehow returned nothing — surface it.
      throw new Error('Folio payment could not be recorded');
    }

    const netPaidPaise = await this.netPaid(input.reservationId, tx);
    await tx
      .update(reservations)
      .set({ paidPaise: netPaidPaise, updatedAt: new Date() })
      .where(eq(reservations.id, input.reservationId));
    return { payment, netPaidPaise };
  }

  /** The full folio for one stay: itemised charges, tax, payments and the balance. */
  async summary(reservationId: string, tx: FolioTx = this.db): Promise<FolioSummary> {
    const [res] = await tx
      .select({
        propertyId: reservations.propertyId,
        totalPaise: reservations.totalPaise,
        ratePaise: reservations.ratePaise,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        adults: reservations.adults,
        children: reservations.children,
        companyGstin: reservations.companyGstin,
      })
      .from(reservations)
      .where(and(eq(reservations.id, reservationId), isNull(reservations.deletedAt)))
      .limit(1);
    const roomChargePaise = res?.totalPaise ?? 0;

    const allLines = await tx
      .select()
      .from(folioLineItems)
      .where(eq(folioLineItems.reservationId, reservationId))
      .orderBy(asc(folioLineItems.postedAt));
    // Voided lines stay on the folio for the record but count for nothing.
    const lineItems = allLines.filter((l) => !l.voidedAt);
    const payments = await tx
      .select()
      .from(folioPayments)
      .where(eq(folioPayments.reservationId, reservationId))
      .orderBy(asc(folioPayments.collectedAt));

    const room = res
      ? await this.roomTax(res, tx)
      : { taxPaise: 0, ratePercent: 0, propertyTaxPaise: 0, intraState: true };

    const ancillaryPaise = lineItems.reduce((s, l) => s + l.amountPaise, 0);
    const lineTaxPaise = lineItems.reduce((s, l) => s + l.taxPaise, 0);
    const paymentsPaise = payments
      .filter((p) => p.direction === 'PAYMENT')
      .reduce((s, p) => s + p.amountPaise, 0);
    const refundsPaise = payments
      .filter((p) => p.direction === 'REFUND')
      .reduce((s, p) => s + p.amountPaise, 0);
    const subtotalPaise = roomChargePaise + ancillaryPaise;
    const taxPaise = room.taxPaise + room.propertyTaxPaise + lineTaxPaise;
    const chargesPaise = subtotalPaise + taxPaise;
    const netPaidPaise = paymentsPaise - refundsPaise;
    return {
      reservationId,
      roomChargePaise,
      roomTaxPaise: room.taxPaise,
      roomTaxRatePercent: room.ratePercent,
      ancillaryPaise,
      lineTaxPaise,
      propertyTaxPaise: room.propertyTaxPaise,
      taxPaise,
      subtotalPaise,
      chargesPaise,
      intraState: room.intraState,
      paymentsPaise,
      refundsPaise,
      netPaidPaise,
      balancePaise: chargesPaise - netPaidPaise,
      lineItems,
      payments,
    };
  }

  /**
   * GST on the room, plus the property's own taxes/fees on it.
   *
   * The slab is chosen on the tariff PER NIGHT and the rate applied to the
   * whole room charge: a three-night ₹3,000 stay is ₹9,000 at 12%, not 18%.
   * Property taxes: PERCENT is basis points of the room charge; FIXED
   * multiplies by nights, guests or once, per its basis.
   */
  private async roomTax(
    res: {
      propertyId: string;
      totalPaise: number;
      ratePaise: number;
      checkIn: string;
      checkOut: string;
      adults: number;
      children: number;
      companyGstin: string | null;
    },
    tx: FolioTx,
  ): Promise<{
    taxPaise: number;
    ratePercent: number;
    propertyTaxPaise: number;
    intraState: boolean;
  }> {
    const intraState = await this.intraStateFor(res, tx);
    const gst =
      res.totalPaise > 0
        ? computeGstForCategory({
            category: 'accommodation',
            taxableAmountPaise: res.totalPaise,
            slabBasisPaise: res.ratePaise,
            intraState,
          })
        : { taxPaise: 0, ratePercent: 0 };

    const taxes = await tx
      .select()
      .from(propertyTaxes)
      .where(
        and(
          eq(propertyTaxes.propertyId, res.propertyId),
          eq(propertyTaxes.isActive, true),
          isNull(propertyTaxes.deletedAt),
        ),
      );
    const nights = Math.max(1, nightsBetween(res.checkIn, res.checkOut));
    const guests = Math.max(1, res.adults + res.children);
    const propertyTaxPaise = taxes
      .filter((t) => t.appliesTo === 'ROOM' || t.appliesTo === 'ALL')
      .reduce(
        (sum, t) => sum + FolioService.propertyTaxAmount(t, res.totalPaise, nights, guests),
        0,
      );

    return { taxPaise: gst.taxPaise, ratePercent: gst.ratePercent, propertyTaxPaise, intraState };
  }

  static propertyTaxAmount(
    t: PropertyTax,
    basePaise: number,
    nights: number,
    guests: number,
  ): number {
    if (t.calculation === 'PERCENT') return Math.round((basePaise * t.value) / 10_000);
    switch (t.basis) {
      case 'PER_NIGHT':
        return t.value * nights;
      case 'PER_GUEST':
        return t.value * guests;
      default:
        return t.value;
    }
  }

  /**
   * Intra- vs inter-state supply. A corporate guest with a GSTIN registered in
   * another state is billed IGST; everyone else, and every property without a
   * registered state code, is CGST+SGST. The place of supply for a hotel is
   * always the hotel, so this only ever compares two state codes.
   */
  private async intraStateFor(
    resOrId: string | { propertyId: string; companyGstin: string | null },
    tx: FolioTx,
  ): Promise<boolean> {
    let res: { propertyId: string; companyGstin: string | null } | undefined;
    if (typeof resOrId === 'string') {
      const [row] = await tx
        .select({ propertyId: reservations.propertyId, companyGstin: reservations.companyGstin })
        .from(reservations)
        .where(eq(reservations.id, resOrId))
        .limit(1);
      res = row;
    } else {
      res = resOrId;
    }
    if (!res?.companyGstin) return true;
    const [settings] = await tx
      .select({ gstStateCode: propertySettings.gstStateCode })
      .from(propertySettings)
      .where(eq(propertySettings.propertyId, res.propertyId))
      .limit(1);
    if (!settings?.gstStateCode) return true;
    return res.companyGstin.slice(0, 2) === settings.gstStateCode;
  }

  static categoryFor(kind: FolioLineKind): GstCategory {
    return kind === 'RESTAURANT' ? 'restaurant' : 'other';
  }

  // ------------------------------------------------------------ adjustments --

  /**
   * A discount is a negative ADJUSTMENT line, never an edit to the original:
   * the charge stays what it was, the concession is its own row with its own
   * reason and author, and the log says who gave what away.
   */
  async applyDiscount(
    input: {
      reservationId: string;
      propertyId: string;
      amountPaise: number;
      reason: string;
      actorStaffId: string | null;
    },
    tx: FolioTx = this.db,
  ) {
    const line = await this.postCharge(
      {
        reservationId: input.reservationId,
        propertyId: input.propertyId,
        kind: 'ADJUSTMENT',
        description: `Discount — ${input.reason}`,
        amountPaise: -Math.abs(input.amountPaise),
        postedBy: input.actorStaffId,
        taxExempt: true,
      },
      tx,
    );
    await this.logEvent(
      {
        reservationId: input.reservationId,
        propertyId: input.propertyId,
        type: 'discount_applied',
        actorStaffId: input.actorStaffId,
        payload: { lineId: line.id, amountPaise: line.amountPaise, reason: input.reason },
      },
      tx,
    );
    return line;
  }

  /** Voids a line: kept for the record, excluded from every total from now on. */
  async voidLine(
    input: {
      reservationId: string;
      propertyId: string;
      lineId: string;
      reason: string;
      actorStaffId: string | null;
    },
    tx: FolioTx = this.db,
  ) {
    const [row] = await tx
      .update(folioLineItems)
      .set({
        voidedAt: new Date(),
        voidedBy: input.actorStaffId,
        voidReason: input.reason,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(folioLineItems.id, input.lineId),
          eq(folioLineItems.reservationId, input.reservationId),
          isNull(folioLineItems.voidedAt),
        ),
      )
      .returning();
    if (row) {
      await this.logEvent(
        {
          reservationId: input.reservationId,
          propertyId: input.propertyId,
          type: 'line_voided',
          actorStaffId: input.actorStaffId,
          payload: { lineId: row.id, amountPaise: row.amountPaise, reason: input.reason },
        },
        tx,
      );
    }
    return row ?? null;
  }

  /** Grants or withdraws a tax exemption on one line, recomputing its tax. */
  async setLineTaxExempt(
    input: {
      reservationId: string;
      propertyId: string;
      lineId: string;
      exempt: boolean;
      reason: string;
      actorStaffId: string | null;
    },
    tx: FolioTx = this.db,
  ) {
    const [line] = await tx
      .select()
      .from(folioLineItems)
      .where(
        and(
          eq(folioLineItems.id, input.lineId),
          eq(folioLineItems.reservationId, input.reservationId),
        ),
      )
      .limit(1);
    if (!line) return null;
    const category =
      (line.taxCategory as GstCategory | null) ?? FolioService.categoryFor(line.kind);
    const intraState = await this.intraStateFor(input.reservationId, tx);
    const gst = input.exempt
      ? { taxPaise: 0, ratePercent: 0 }
      : computeGstForCategory({ category, taxableAmountPaise: line.amountPaise, intraState });
    const [row] = await tx
      .update(folioLineItems)
      .set({
        taxExempt: input.exempt,
        taxPaise: gst.taxPaise,
        taxRateBp: Math.round(gst.ratePercent * 100),
        updatedAt: new Date(),
      })
      .where(eq(folioLineItems.id, line.id))
      .returning();
    await this.logEvent(
      {
        reservationId: input.reservationId,
        propertyId: input.propertyId,
        type: input.exempt ? 'tax_exempted' : 'tax_exemption_removed',
        actorStaffId: input.actorStaffId,
        payload: { lineId: line.id, reason: input.reason },
      },
      tx,
    );
    return row;
  }

  /** The folio's own log, oldest first. */
  events(reservationId: string, tx: FolioTx = this.db) {
    return tx
      .select()
      .from(folioEvents)
      .where(eq(folioEvents.reservationId, reservationId))
      .orderBy(asc(folioEvents.createdAt));
  }

  async logEvent(
    e: {
      reservationId: string;
      propertyId: string;
      type: string;
      actorStaffId: string | null;
      payload?: Record<string, unknown>;
    },
    tx: FolioTx = this.db,
  ) {
    await tx.insert(folioEvents).values({
      reservationId: e.reservationId,
      propertyId: e.propertyId,
      type: e.type,
      actorStaffId: e.actorStaffId,
      payload: e.payload ?? null,
    });
  }

  /**
   * The outstanding balance for one stay, computed in-transaction — what the
   * checkout gate reads. Positive means the guest still owes money.
   */
  async balancePaise(reservationId: string, _roomTotalPaise: number, tx: FolioTx): Promise<number> {
    // Tax-inclusive, exactly as the guest sees it on the folio — the checkout
    // gate must not let a guest leave owing the GST.
    const s = await this.summary(reservationId, tx);
    return s.balancePaise;
  }

  // --------------------------------------------------------------- helpers ---

  private async netPaid(reservationId: string, tx: FolioTx): Promise<number> {
    const rows = await tx
      .select({
        net: sql<number>`coalesce(sum(case when ${folioPayments.direction} = 'REFUND' then -${folioPayments.amountPaise} else ${folioPayments.amountPaise} end), 0)::int`,
      })
      .from(folioPayments)
      .where(eq(folioPayments.reservationId, reservationId));
    return rows[0]?.net ?? 0;
  }

  private async findLineBySource(
    sourceType: string,
    sourceId: string,
    tx: FolioTx,
  ): Promise<typeof folioLineItems.$inferSelect | undefined> {
    const [row] = await tx
      .select()
      .from(folioLineItems)
      .where(and(eq(folioLineItems.sourceType, sourceType), eq(folioLineItems.sourceId, sourceId)))
      .limit(1);
    return row;
  }

  private async findPaymentByKey(
    reservationId: string,
    idempotencyKey: string,
    tx: FolioTx,
  ): Promise<typeof folioPayments.$inferSelect | undefined> {
    const [row] = await tx
      .select()
      .from(folioPayments)
      .where(
        and(
          eq(folioPayments.reservationId, reservationId),
          eq(folioPayments.idempotencyKey, idempotencyKey),
        ),
      )
      .limit(1);
    return row;
  }
}
