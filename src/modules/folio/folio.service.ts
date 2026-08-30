import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  folioLineItems,
  folioPayments,
  reservations,
  type FolioLineKind,
  type FolioPaymentDirection,
  type FolioPaymentMethod,
} from '../../database/schema';

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
  ancillaryPaise: number;
  chargesPaise: number;
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
    const [row] = await tx
      .insert(folioLineItems)
      .values({
        reservationId: input.reservationId,
        propertyId: input.propertyId,
        kind: input.kind,
        description: input.description,
        amountPaise: input.amountPaise,
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

  /** The full folio for one stay: itemised charges, payments and the balance. */
  async summary(reservationId: string, tx: FolioTx = this.db): Promise<FolioSummary> {
    const [res] = await tx
      .select({ totalPaise: reservations.totalPaise })
      .from(reservations)
      .where(and(eq(reservations.id, reservationId), isNull(reservations.deletedAt)))
      .limit(1);
    const roomChargePaise = res?.totalPaise ?? 0;

    const lineItems = await tx
      .select()
      .from(folioLineItems)
      .where(eq(folioLineItems.reservationId, reservationId))
      .orderBy(asc(folioLineItems.postedAt));
    const payments = await tx
      .select()
      .from(folioPayments)
      .where(eq(folioPayments.reservationId, reservationId))
      .orderBy(asc(folioPayments.collectedAt));

    const ancillaryPaise = lineItems.reduce((s, l) => s + l.amountPaise, 0);
    const paymentsPaise = payments
      .filter((p) => p.direction === 'PAYMENT')
      .reduce((s, p) => s + p.amountPaise, 0);
    const refundsPaise = payments
      .filter((p) => p.direction === 'REFUND')
      .reduce((s, p) => s + p.amountPaise, 0);
    const chargesPaise = roomChargePaise + ancillaryPaise;
    const netPaidPaise = paymentsPaise - refundsPaise;
    return {
      reservationId,
      roomChargePaise,
      ancillaryPaise,
      chargesPaise,
      paymentsPaise,
      refundsPaise,
      netPaidPaise,
      balancePaise: chargesPaise - netPaidPaise,
      lineItems,
      payments,
    };
  }

  /**
   * The outstanding balance for one stay, computed in-transaction — what the
   * checkout gate reads. Positive means the guest still owes money.
   */
  async balancePaise(reservationId: string, roomTotalPaise: number, tx: FolioTx): Promise<number> {
    const ancRows = await tx
      .select({
        ancillary: sql<number>`coalesce(sum(${folioLineItems.amountPaise}), 0)::int`,
      })
      .from(folioLineItems)
      .where(eq(folioLineItems.reservationId, reservationId));
    const ancillary = ancRows[0]?.ancillary ?? 0;
    const net = await this.netPaid(reservationId, tx);
    return roomTotalPaise + ancillary - net;
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
