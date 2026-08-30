import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, sql, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  invoices,
  owners,
  payments,
  properties,
  refunds,
  subscriptionEvents,
  subscriptionPlans,
  subscriptions,
  webhookEvents,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { StorageService } from '../storage/storage.service';
import { InvoiceNumberService } from './invoice-number.service';
import { InvoicePdfService } from './invoice-pdf.service';
import { RazorpayClient } from './razorpay.client';
import { CashfreeClient } from './cashfree.client';
import { PROVIDERS, SettlementHint, WebhookInput } from './payment-providers';
import { getRequestContext } from '../../common/context/request-context';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service';
import { inAppRecipient } from '../notifications/channels/channel.interface';
import { addMonths } from '../../common/date/add-months';

/** Invoice documents are longer-lived than photos but still not permanent. */
const INVOICE_URL_TTL_SECONDS = 900;

/** The Drizzle handle inside a transaction callback. */
type Tx = Parameters<Parameters<Database['transaction']>[0]>[0];

export const manualPaymentMethods = ['CASH', 'BANK_TRANSFER', 'UPI', 'CHEQUE'] as const;
export type ManualPaymentMethod = (typeof manualPaymentMethods)[number];

/** Everything the one settlement path needs, whatever produced the money. */
export interface SettleInput {
  ownerId: string;
  subscriptionId?: string | null;
  amountPaise: number;
  currency?: string;
  gateway: 'RAZORPAY' | 'CASHFREE' | 'MANUAL' | 'STRIPE';
  gatewayRef?: string | null;
  method?: string | null;
  raw?: unknown;
  /** An existing PENDING payment row to resolve instead of inserting a new one. */
  existingPaymentId?: string | null;
  /** Audit/event provenance: what triggered this settlement. */
  source: 'webhook' | 'manual';
  note?: string;
  now?: Date;
}

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly invNum: InvoiceNumberService,
    private readonly config: ConfigService,
    private readonly storage: StorageService,
    private readonly pdf: InvoicePdfService,
    private readonly razorpay: RazorpayClient,
    private readonly cashfree: CashfreeClient,
    private readonly notifications: NotificationDeliveryService,
  ) {}

  // ---------- The single settlement path ----------

  /**
   * The renewal rule, in one pure function so it can be tested without a
   * database and cannot be re-implemented differently in two places.
   *
   * A renewal extends from the LATER of now and the current period end. Paying
   * early must not shorten what was already bought; paying late must not
   * back-date the new period into the past.
   */
  static computeRenewal(
    now: Date,
    currentPeriodEnd: Date,
    durationMonths: number,
  ): { periodStart: Date; periodEnd: Date } {
    if (!Number.isInteger(durationMonths) || durationMonths < 1 || durationMonths > 120) {
      throw new BadRequestException('Plan durationMonths must be an integer between 1 and 120');
    }
    const periodStart = new Date(Math.max(now.getTime(), currentPeriodEnd.getTime()));
    return { periodStart, periodEnd: addMonths(periodStart, durationMonths) };
  }

  /**
   * ONE place where money becomes a renewed subscription and an issued invoice.
   *
   * The gateway webhook and the manual-payment endpoint both land here, so the
   * two can never drift: same renewal maths, same invoice shape, same events,
   * same audit trail. The only difference between them is what they put in
   * `gateway` and `gatewayRef`.
   *
   * Everything that must be all-or-nothing runs in ONE transaction. The PDF is
   * generated AFTER the commit, on purpose — a storage failure must not undo a
   * payment that the gateway has already taken.
   */
  async settleSuccessfulPayment(input: SettleInput) {
    if (!Number.isInteger(input.amountPaise) || input.amountPaise <= 0) {
      throw new BadRequestException('amountPaise must be a positive integer');
    }
    const now = input.now ?? new Date();
    // Allocated outside the transaction: the sequence is a counter, not part of
    // the money, and a rollback must not hand the same number to two invoices.
    const invoiceNumber = await this.invNum.next(now);

    const result = await this.db.transaction(async (tx) =>
      this.settleInTx(tx, input, now, invoiceNumber),
    );

    await this.audit.record({
      action: `billing.payment.settled.${input.source}`,
      entity: 'payment',
      entityId: result.payment.id,
      after: {
        paymentId: result.payment.id,
        invoiceId: result.invoice.id,
        invoiceNumber: result.invoice.invoiceNumber,
        amount: input.amountPaise,
        gateway: input.gateway,
        gatewayRef: input.gatewayRef ?? null,
        subscriptionId: input.subscriptionId ?? null,
        previousPeriodEnd: result.previousPeriodEnd,
        newPeriodEnd: result.newPeriodEnd,
      },
      reason: input.note,
    });

    // Post-commit and best-effort. `generateQuietly` swallows and logs.
    await this.pdf.generateQuietly(result.invoice.id);

    // Same discipline, one line later: the money is already committed, so
    // telling the owner about it can only ever log on failure.
    await this.notifyPaymentSuccess(input, result);

    return result;
  }

  private async settleInTx(tx: Tx, input: SettleInput, now: Date, invoiceNumber: string) {
    const currency = input.currency ?? 'INR';

    // ---- 1. Renew the subscription (when the payment is for one) ----
    let periodStart = now;
    let periodEnd = now;
    let previousPeriodEnd: Date | null = null;
    if (input.subscriptionId) {
      const [row] = await tx
        .select({ s: subscriptions, p: subscriptionPlans })
        .from(subscriptions)
        .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
        .where(eq(subscriptions.id, input.subscriptionId))
        .limit(1);
      if (!row) throw new NotFoundException('Subscription not found');
      if (row.s.ownerId !== input.ownerId) {
        throw new BadRequestException('Subscription does not belong to this owner');
      }
      previousPeriodEnd = row.s.currentPeriodEnd;
      const renewed = BillingService.computeRenewal(
        now,
        row.s.currentPeriodEnd,
        row.p.durationMonths,
      );
      periodStart = renewed.periodStart;
      periodEnd = renewed.periodEnd;

      await tx
        .update(subscriptions)
        .set({
          currentPeriodStart: periodStart,
          currentPeriodEnd: periodEnd,
          status: 'ACTIVE',
          updatedAt: now,
        })
        .where(eq(subscriptions.id, input.subscriptionId));
    }

    // ---- 2. The invoice for the period just paid for ----
    const [invoice] = await tx
      .insert(invoices)
      .values({
        invoiceNumber,
        ownerId: input.ownerId,
        subscriptionId: input.subscriptionId ?? undefined,
        billingPeriodStart: periodStart,
        billingPeriodEnd: periodEnd,
        // No tax maths is invented here. The amount collected IS the subtotal
        // and the total; a tax regime, when one exists, must be applied by
        // whatever builds the charge, not by the settlement path.
        subtotal: input.amountPaise,
        tax: 0,
        discount: 0,
        total: input.amountPaise,
        currency,
        status: 'PAID',
        issuedAt: now,
        paidAt: now,
      })
      .returning();

    // ---- 3. The payment row: resolve a PENDING order, or insert fresh ----
    let payment: typeof payments.$inferSelect;
    if (input.existingPaymentId) {
      const [updated] = await tx
        .update(payments)
        .set({
          status: 'SUCCESS',
          invoiceId: invoice.id,
          gatewayRef: input.gatewayRef ?? undefined,
          method: input.method ?? undefined,
          amount: input.amountPaise,
          capturedAt: now,
          raw: (input.raw ?? undefined) as never,
          updatedAt: now,
        })
        .where(eq(payments.id, input.existingPaymentId))
        .returning();
      payment = updated;
    } else {
      const [inserted] = await tx
        .insert(payments)
        .values({
          ownerId: input.ownerId,
          subscriptionId: input.subscriptionId ?? undefined,
          invoiceId: invoice.id,
          gateway: input.gateway,
          gatewayRef: input.gatewayRef ?? undefined,
          amount: input.amountPaise,
          currency,
          status: 'SUCCESS',
          method: input.method ?? undefined,
          capturedAt: now,
          raw: (input.raw ?? undefined) as never,
        })
        .returning();
      payment = inserted;
    }

    // ---- 4. The subscription's own history ----
    if (input.subscriptionId) {
      await tx.insert(subscriptionEvents).values({
        subscriptionId: input.subscriptionId,
        type: 'renewal',
        actorAdminId: getRequestContext()?.adminId,
        payload: {
          source: input.source,
          gateway: input.gateway,
          gatewayRef: input.gatewayRef ?? null,
          paymentId: payment.id,
          invoiceId: invoice.id,
          invoiceNumber: invoice.invoiceNumber,
          amount: input.amountPaise,
          previousPeriodEnd,
          newPeriodStart: periodStart,
          newPeriodEnd: periodEnd,
          note: input.note,
        },
      });
    }

    return { payment, invoice, previousPeriodEnd, newPeriodEnd: periodEnd };
  }

  /** Formats paise as rupees for human-facing copy. */
  static formatAmount(paise: number, currency = 'INR'): string {
    const major = (paise / 100).toFixed(2);
    return currency === 'INR' ? `₹${major}` : `${currency} ${major}`;
  }

  /** Post-commit, best-effort. Enqueue only — nothing here can throw upward. */
  private async notifyPaymentSuccess(
    input: SettleInput,
    result: { invoice: { id: string; invoiceNumber: string }; newPeriodEnd: Date },
  ): Promise<void> {
    try {
      const [owner] = await this.db
        .select({ id: owners.id, name: owners.name, email: owners.email })
        .from(owners)
        .where(eq(owners.id, input.ownerId))
        .limit(1);
      if (!owner) return;
      await this.notifications.notifyQuietly({
        key: 'payment.success',
        relatedType: 'invoice',
        relatedId: result.invoice.id,
        targets: [
          { channel: 'EMAIL', to: owner.email ?? '' },
          { channel: 'IN_APP', to: inAppRecipient('owner', owner.id) },
        ],
        vars: {
          ownerName: owner.name,
          amount: BillingService.formatAmount(input.amountPaise, input.currency ?? 'INR'),
          invoiceNumber: result.invoice.invoiceNumber,
          planName: 'your plan',
          periodEnd: result.newPeriodEnd.toISOString().slice(0, 10),
        },
      });
    } catch (err) {
      this.logger.error(
        `payment.success notification failed for owner ${input.ownerId} — the payment is unaffected`,
        err as Error,
      );
    }
  }

  /** The other half of the money path: a gateway told us the payment failed. */
  private async notifyPaymentFailed(
    ownerId: string,
    amountPaise: number,
    currency: string,
    reason: string,
    relatedId?: string,
  ): Promise<void> {
    try {
      const [owner] = await this.db
        .select({ id: owners.id, name: owners.name, email: owners.email })
        .from(owners)
        .where(eq(owners.id, ownerId))
        .limit(1);
      if (!owner) return;
      const [property] = await this.db
        .select({ name: properties.name })
        .from(properties)
        .where(eq(properties.ownerId, ownerId))
        .limit(1);
      await this.notifications.notifyQuietly({
        key: 'payment.failed',
        relatedType: 'payment',
        relatedId,
        targets: [
          { channel: 'EMAIL', to: owner.email ?? '' },
          { channel: 'IN_APP', to: inAppRecipient('owner', owner.id) },
        ],
        vars: {
          ownerName: owner.name,
          propertyName: property?.name ?? 'your property',
          amount: BillingService.formatAmount(amountPaise, currency),
          reason,
        },
      });
    } catch (err) {
      this.logger.error(`payment.failed notification failed for owner ${ownerId}`, err as Error);
    }
  }

  /**
   * Money that arrived outside any gateway — cash at the desk, an NEFT, a UPI
   * transfer, a cheque. This is what makes the platform collectable on day one
   * with zero gateway credentials, and it settles through exactly the same code
   * a webhook does.
   */
  async recordManualPayment(dto: {
    ownerId: string;
    subscriptionId?: string;
    amountPaise: number;
    method: ManualPaymentMethod;
    reference?: string;
    note?: string;
  }) {
    const [owner] = await this.db
      .select({ id: owners.id })
      .from(owners)
      .where(eq(owners.id, dto.ownerId))
      .limit(1);
    if (!owner) throw new NotFoundException('Owner not found');

    return this.settleSuccessfulPayment({
      ownerId: dto.ownerId,
      subscriptionId: dto.subscriptionId,
      amountPaise: dto.amountPaise,
      gateway: 'MANUAL',
      gatewayRef: dto.reference,
      method: dto.method,
      raw: { manual: true, method: dto.method, reference: dto.reference, note: dto.note },
      source: 'manual',
      note: dto.note,
    });
  }

  // ---------- Gateway order creation ----------

  /**
   * Creates a Razorpay order for a subscription's next period and parks a
   * PENDING payment carrying its id. The webhook later finds that row by
   * `gatewayRef` and settles it — so an order is the only thing this writes.
   */
  async createGatewayOrder(dto: {
    ownerId: string;
    subscriptionId: string;
    gateway?: 'RAZORPAY' | 'CASHFREE';
  }) {
    const [row] = await this.db
      .select({ s: subscriptions, p: subscriptionPlans })
      .from(subscriptions)
      .innerJoin(subscriptionPlans, eq(subscriptions.planId, subscriptionPlans.id))
      .where(eq(subscriptions.id, dto.subscriptionId))
      .limit(1);
    if (!row) throw new NotFoundException('Subscription not found');
    if (row.s.ownerId !== dto.ownerId) {
      throw new BadRequestException('Subscription does not belong to this owner');
    }

    const amountPaise = row.s.priceOverride ?? row.p.monthlyPrice * row.p.durationMonths;
    const currency = row.p.currency;
    const gateway = dto.gateway ?? 'RAZORPAY';

    return gateway === 'CASHFREE'
      ? this.createCashfreeOrder(dto, amountPaise, currency)
      : this.createRazorpayOrder(dto, amountPaise, currency);
  }

  private async createRazorpayOrder(
    dto: { ownerId: string; subscriptionId: string },
    amountPaise: number,
    currency: string,
  ) {
    if (!this.razorpay.configured) {
      throw new BadRequestException({
        error: 'GATEWAY_NOT_CONFIGURED',
        message:
          'Razorpay credentials are not configured. Record the payment manually via POST /billing/payments/manual.',
      });
    }

    const order = await this.razorpay.createOrder({
      amountPaise,
      currency,
      // Razorpay caps receipts at 40 characters.
      receipt: `sub-${dto.subscriptionId}`.slice(0, 40),
      notes: { ownerId: dto.ownerId, subscriptionId: dto.subscriptionId },
    });

    const payment = await this.parkPendingOrder({
      ownerId: dto.ownerId,
      subscriptionId: dto.subscriptionId,
      gateway: 'RAZORPAY',
      gatewayRef: order.id,
      amountPaise,
      currency,
      raw: order,
    });

    return {
      paymentId: payment.id,
      gateway: 'RAZORPAY' as const,
      orderId: order.id,
      amount: amountPaise,
      currency,
      keyId: this.razorpay.publicKeyId,
    };
  }

  private async createCashfreeOrder(
    dto: { ownerId: string; subscriptionId: string },
    amountPaise: number,
    currency: string,
  ) {
    if (!this.cashfree.configured) {
      throw new BadRequestException({
        error: 'GATEWAY_NOT_CONFIGURED',
        message:
          'Cashfree credentials are not configured. Record the payment manually via POST /billing/payments/manual.',
      });
    }

    // A gateway-unique order id the webhook can resolve back to this row.
    const orderId = `sub-${dto.subscriptionId}-${Date.now()}`.slice(0, 45);
    const order = await this.cashfree.createOrder({
      amountPaise,
      currency,
      orderId,
      customerId: dto.ownerId,
      notes: { ownerId: dto.ownerId, subscriptionId: dto.subscriptionId },
    });

    const payment = await this.parkPendingOrder({
      ownerId: dto.ownerId,
      subscriptionId: dto.subscriptionId,
      gateway: 'CASHFREE',
      gatewayRef: order.order_id,
      amountPaise,
      currency,
      raw: order,
    });

    return {
      paymentId: payment.id,
      gateway: 'CASHFREE' as const,
      orderId: order.order_id,
      amount: amountPaise,
      currency,
      paymentSessionId: order.payment_session_id,
      appId: this.cashfree.publicAppId,
    };
  }

  /** The single PENDING-payment write shared by both gateway order paths. */
  private async parkPendingOrder(input: {
    ownerId: string;
    subscriptionId: string;
    gateway: 'RAZORPAY' | 'CASHFREE';
    gatewayRef: string;
    amountPaise: number;
    currency: string;
    raw: unknown;
  }) {
    const [payment] = await this.db
      .insert(payments)
      .values({
        ownerId: input.ownerId,
        subscriptionId: input.subscriptionId,
        gateway: input.gateway,
        gatewayRef: input.gatewayRef,
        amount: input.amountPaise,
        currency: input.currency,
        status: 'PENDING',
        raw: input.raw as never,
      })
      .returning();

    await this.audit.record({
      action: 'billing.order.created',
      entity: 'payment',
      entityId: payment.id,
      after: {
        orderId: input.gatewayRef,
        gateway: input.gateway,
        amount: input.amountPaise,
        currency: input.currency,
      },
    });

    return payment;
  }

  // ---------- Payments ----------
  async listPayments(params: {
    limit?: number;
    offset?: number;
    ownerId?: string;
    status?: string;
    failedOnly?: boolean;
  }) {
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;
    const conds: SQL[] = [];
    if (params.ownerId) conds.push(eq(payments.ownerId, params.ownerId));
    if (params.status) conds.push(eq(payments.status, params.status as never));
    if (params.failedOnly) conds.push(eq(payments.status, 'FAILED' as never));
    const where = conds.length ? and(...conds) : undefined;
    const rows = await this.db
      .select({ p: payments, ownerCompany: owners.company })
      .from(payments)
      .leftJoin(owners, eq(payments.ownerId, owners.id))
      .where(where)
      .orderBy(desc(payments.createdAt))
      .limit(limit)
      .offset(offset);
    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(payments)
      .where(where);
    return {
      items: rows.map((r) => ({ ...r.p, owner: r.ownerCompany })),
      total,
      limit,
      offset,
    };
  }

  async getPayment(id: string) {
    const [row] = await this.db.select().from(payments).where(eq(payments.id, id)).limit(1);
    if (!row) throw new NotFoundException('Payment not found');
    const rfs = await this.db.select().from(refunds).where(eq(refunds.paymentId, id));
    return { ...row, refunds: rfs };
  }

  /**
   * Records a refund against a successful payment.
   *
   * The LEDGER move is authoritative and happens in a transaction. Calling the
   * gateway happens after that commit, for the same reason PDF generation does:
   * a network failure must not silently un-refund a row an admin was told was
   * refunded. Without gateway credentials — or for a payment that never went
   * through one — the refund is marked MANUAL, meaning "move the money by hand
   * and this row is the record of it".
   */
  async refundPayment(paymentId: string, dto: { amount: number; reason?: string }) {
    const { refund, pay } = await this.refundInTx(paymentId, dto);

    const canCallGateway =
      this.razorpay.configured && pay.gateway === 'RAZORPAY' && !!pay.gatewayRef;
    if (!canCallGateway) {
      const [manual] = await this.db
        .update(refunds)
        .set({ status: 'MANUAL' })
        .where(eq(refunds.id, refund.id))
        .returning();
      return manual;
    }

    try {
      const gwRefund = await this.razorpay.createRefund(pay.gatewayRef!, dto.amount);
      const [processed] = await this.db
        .update(refunds)
        .set({ status: 'PROCESSED', gatewayRef: gwRefund.id })
        .where(eq(refunds.id, refund.id))
        .returning();
      await this.audit.record({
        action: 'billing.refund.gateway.succeeded',
        entity: 'refund',
        entityId: refund.id,
        after: { gatewayRefundId: gwRefund.id, amount: dto.amount },
      });
      return processed;
    } catch (err) {
      this.logger.error(
        `Razorpay refund failed for payment ${paymentId}; the refund row stays PENDING for retry`,
        err as Error,
      );
      await this.audit.record({
        action: 'billing.refund.gateway.failed',
        entity: 'refund',
        entityId: refund.id,
        after: { error: (err as Error).message },
      });
      return refund;
    }
  }

  private async refundInTx(paymentId: string, dto: { amount: number; reason?: string }) {
    const ctx = getRequestContext();
    return this.db.transaction(async (tx) => {
      const [pay] = await tx.select().from(payments).where(eq(payments.id, paymentId)).limit(1);
      if (!pay) throw new NotFoundException('Payment not found');
      if (pay.status !== 'SUCCESS' && pay.status !== 'PARTIALLY_REFUNDED') {
        throw new BadRequestException(
          'Only successful or partially refunded payments can be refunded',
        );
      }
      const [refundedSum] = await tx
        .select({ sum: sql<number>`coalesce(sum(amount),0)::int` })
        .from(refunds)
        .where(eq(refunds.paymentId, paymentId));
      const alreadyRefunded = Number(refundedSum.sum);
      if (dto.amount + alreadyRefunded > pay.amount) {
        throw new BadRequestException('Refund exceeds payment amount');
      }
      const [refund] = await tx
        .insert(refunds)
        .values({
          paymentId,
          amount: dto.amount,
          reason: dto.reason,
          status: 'PENDING',
          createdBy: ctx?.adminId,
        })
        .returning();
      const totalRefunded = alreadyRefunded + dto.amount;
      const newStatus = totalRefunded >= pay.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
      await tx
        .update(payments)
        .set({ status: newStatus as never, updatedAt: new Date() })
        .where(eq(payments.id, paymentId));
      await this.audit.record({
        action: 'billing.refund.created',
        entity: 'payment',
        entityId: paymentId,
        after: refund,
        reason: dto.reason,
      });
      return { refund, pay };
    });
  }

  async listRefunds(params: { limit?: number; offset?: number }) {
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;
    const rows = await this.db
      .select()
      .from(refunds)
      .orderBy(desc(refunds.createdAt))
      .limit(limit)
      .offset(offset);
    return { items: rows, limit, offset };
  }

  // ---------- Invoices ----------
  async listInvoices(params: {
    limit?: number;
    offset?: number;
    ownerId?: string;
    status?: string;
  }) {
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;
    const conds: SQL[] = [];
    if (params.ownerId) conds.push(eq(invoices.ownerId, params.ownerId));
    if (params.status) conds.push(eq(invoices.status, params.status));
    const where = conds.length ? and(...conds) : undefined;
    const rows = await this.db
      .select({ i: invoices, ownerCompany: owners.company })
      .from(invoices)
      .leftJoin(owners, eq(invoices.ownerId, owners.id))
      .where(where)
      .orderBy(desc(invoices.createdAt))
      .limit(limit)
      .offset(offset);
    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(invoices)
      .where(where);
    return {
      items: rows.map((r) => ({ ...r.i, owner: r.ownerCompany })),
      total,
      limit,
      offset,
    };
  }

  async getInvoice(id: string) {
    const [row] = await this.db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    if (!row) throw new NotFoundException('Invoice not found');
    return { ...row, hasDocument: !!row.storageKey };
  }

  /**
   * Presigned URL for the invoice document. PDF *generation* does not exist
   * yet — this is the storage plumbing, so it 404s until something writes a
   * key. Documents live under `invoices/<ownerId>/<invoiceNumber>.pdf`.
   */
  async invoiceDocumentUrl(id: string) {
    const [row] = await this.db.select().from(invoices).where(eq(invoices.id, id)).limit(1);
    if (!row) throw new NotFoundException('Invoice not found');
    if (!row.storageKey) {
      throw new NotFoundException({
        error: 'INVOICE_DOCUMENT_NOT_AVAILABLE',
        message: 'No document has been generated for this invoice yet',
      });
    }
    return {
      url: await this.storage.getSignedUrl(row.storageKey, INVOICE_URL_TTL_SECONDS),
      expiresInSeconds: INVOICE_URL_TTL_SECONDS,
    };
  }

  /** Object key an invoice document is (or will be) stored under. */
  static invoiceObjectKey(ownerId: string, invoiceNumber: string): string {
    return `invoices/${ownerId}/${invoiceNumber}.pdf`;
  }

  /** Records the document that was uploaded for an invoice. */
  async attachInvoiceDocument(id: string, body: Buffer, contentType = 'application/pdf') {
    const invoice = await this.getInvoice(id);
    const key = BillingService.invoiceObjectKey(invoice.ownerId, invoice.invoiceNumber);
    await this.storage.put(key, body, contentType);
    await this.db.update(invoices).set({ storageKey: key }).where(eq(invoices.id, id));
    await this.audit.record({
      action: 'invoice.document.attached',
      entity: 'invoice',
      entityId: id,
      after: { storageKey: key },
    });
    return { storageKey: key };
  }

  async createInvoice(dto: {
    ownerId: string;
    subscriptionId?: string;
    billingPeriodStart: Date;
    billingPeriodEnd: Date;
    subtotal: number;
    tax?: number;
    discount?: number;
    currency?: string;
    dueDate?: Date;
  }) {
    const total = dto.subtotal + (dto.tax ?? 0) - (dto.discount ?? 0);
    const invoiceNumber = await this.invNum.next();
    const [row] = await this.db
      .insert(invoices)
      .values({
        invoiceNumber,
        ownerId: dto.ownerId,
        subscriptionId: dto.subscriptionId,
        billingPeriodStart: dto.billingPeriodStart,
        billingPeriodEnd: dto.billingPeriodEnd,
        subtotal: dto.subtotal,
        tax: dto.tax ?? 0,
        discount: dto.discount ?? 0,
        total,
        currency: dto.currency ?? 'INR',
        dueDate: dto.dueDate,
      })
      .returning();
    await this.audit.record({
      action: 'invoice.created',
      entity: 'invoice',
      entityId: row.id,
      after: row,
    });
    return row;
  }

  async setInvoiceStatus(id: string, status: 'ISSUED' | 'PAID' | 'CANCELLED') {
    const before = await this.getInvoice(id);
    const patch: Record<string, unknown> = { status, updatedAt: new Date() };
    if (status === 'ISSUED') patch.issuedAt = new Date();
    if (status === 'PAID') patch.paidAt = new Date();
    await this.db.update(invoices).set(patch).where(eq(invoices.id, id));
    const after = await this.getInvoice(id);
    await this.audit.record({
      action: `invoice.${status.toLowerCase()}`,
      entity: 'invoice',
      entityId: id,
      before,
      after,
    });
    // Issuing an invoice is what makes it a document someone can be handed.
    // Best-effort: a storage outage must not stop the invoice being issued.
    if (status === 'ISSUED') await this.pdf.generateQuietly(id);
    return after;
  }

  /**
   * (Re)generates an invoice document on demand — the retry for every place
   * that generates one best-effort. Unlike those, this one surfaces failures,
   * because an admin asked for it and needs to know if it did not work.
   */
  async regenerateInvoiceDocument(id: string) {
    await this.getInvoice(id); // 404s for an unknown invoice
    const { storageKey } = await this.pdf.generate(id);
    await this.audit.record({
      action: 'invoice.document.generated',
      entity: 'invoice',
      entityId: id,
      after: { storageKey },
    });
    return {
      storageKey,
      url: await this.storage.getSignedUrl(storageKey, INVOICE_URL_TTL_SECONDS),
      expiresInSeconds: INVOICE_URL_TTL_SECONDS,
    };
  }

  // ---------- Webhooks ----------
  async handleWebhook(providerKey: string, input: WebhookInput) {
    const provider = PROVIDERS[providerKey];
    if (!provider) throw new BadRequestException('Unknown provider');
    const secret = this.config.get<string>(`PAYMENT_WEBHOOK_SECRET_${providerKey.toUpperCase()}`);
    if (secret) {
      const ok = provider.verifySignature(input, secret);
      if (!ok) throw new BadRequestException('Signature mismatch');
    } else {
      this.logger.warn(
        `Webhook secret for ${providerKey} not configured; skipping signature verification (dev only)`,
      );
    }
    const eventId = provider.extractEventId(input);
    const eventType = provider.extractEventType(input);

    // Idempotency is claimed BEFORE any money moves: the unique index on
    // (provider, event_id) is what makes a redelivered webhook a no-op rather
    // than a second renewal. A gateway retrying five times must renew once.
    let row: typeof webhookEvents.$inferSelect;
    try {
      [row] = await this.db
        .insert(webhookEvents)
        .values({
          provider: providerKey,
          eventId,
          eventType,
          payload: input.parsedBody,
        })
        .returning();
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? String(err);
      if (msg.includes('webhook_events_unique') || msg.includes('duplicate key')) {
        return { ok: true, replayed: true };
      }
      throw err;
    }

    try {
      const settled = await this.dispatchWebhook(provider.extractSettlement(input), providerKey);
      // A gateway "payment failed" event settles nothing but is the ONLY
      // moment the owner learns the charge did not go through.
      if (!settled && /fail/i.test(eventType)) {
        await this.notifyWebhookFailure(input, eventType);
      }
      await this.db
        .update(webhookEvents)
        .set({ processedAt: new Date() })
        .where(eq(webhookEvents.id, row.id));
      return { ok: true, id: row.id, replayed: false, settled };
    } catch (err) {
      // The event row stays, unprocessed, with the reason on it — the gateway
      // gets a 2xx (it has no useful retry to make) and the failure is visible.
      await this.db
        .update(webhookEvents)
        .set({ error: (err as Error).message?.slice(0, 2000) ?? 'unknown error' })
        .where(eq(webhookEvents.id, row.id));
      this.logger.error(`Webhook ${providerKey}/${eventId} failed to process`, err as Error);
      await this.notifyWebhookFailure(input, eventType, (err as Error).message);
      return { ok: true, id: row.id, replayed: false, settled: false };
    }
  }

  /**
   * Resolves the PENDING payment a failed webhook refers to and tells its
   * owner. Best-effort throughout: a webhook that could not be processed must
   * not also 500 because the notification lookup failed.
   */
  private async notifyWebhookFailure(
    input: WebhookInput,
    eventType: string,
    reason?: string,
  ): Promise<void> {
    try {
      const body = input.parsedBody ?? {};
      const refs = [
        body?.payload?.payment?.entity?.order_id,
        body?.payload?.payment?.entity?.id,
        body?.data?.order?.order_id,
        body?.data?.payment?.cf_payment_id,
      ]
        .filter((r) => typeof r === 'string' && r.length > 0)
        .map(String);
      for (const ref of refs) {
        const [pending] = await this.db
          .select()
          .from(payments)
          .where(and(eq(payments.gatewayRef, ref), eq(payments.status, 'PENDING')))
          .limit(1);
        if (!pending) continue;
        await this.notifyPaymentFailed(
          pending.ownerId,
          pending.amount,
          pending.currency,
          reason ?? eventType,
          pending.id,
        );
        return;
      }
    } catch (err) {
      this.logger.error('payment.failed notification lookup failed', err as Error);
    }
  }

  /**
   * Turns a captured-payment webhook into a settlement, through the SAME
   * `settleSuccessfulPayment` the manual path uses. Any other event type is
   * recorded and ignored.
   */
  private async dispatchWebhook(
    hint: SettlementHint | null,
    providerKey: string,
  ): Promise<boolean> {
    if (!hint) return false;

    // Order creation parked a PENDING row carrying the order id. Find it, so
    // the webhook resolves that row rather than inventing a second payment.
    let pending: typeof payments.$inferSelect | undefined;
    for (const ref of [hint.orderRef, hint.paymentRef].filter(Boolean) as string[]) {
      const [found] = await this.db
        .select()
        .from(payments)
        .where(and(eq(payments.gatewayRef, ref), eq(payments.status, 'PENDING')))
        .limit(1);
      if (found) {
        pending = found;
        break;
      }
    }
    if (!pending) {
      this.logger.warn(
        `No PENDING payment matched webhook refs (${hint.orderRef ?? '-'} / ${hint.paymentRef ?? '-'}); recorded without settling`,
      );
      return false;
    }

    await this.settleSuccessfulPayment({
      ownerId: pending.ownerId,
      subscriptionId: pending.subscriptionId,
      amountPaise: hint.amountPaise ?? pending.amount,
      currency: hint.currency ?? pending.currency,
      gateway: providerKey.toUpperCase() as 'RAZORPAY' | 'CASHFREE',
      gatewayRef: hint.paymentRef ?? hint.orderRef ?? pending.gatewayRef,
      method: hint.method,
      raw: hint,
      existingPaymentId: pending.id,
      source: 'webhook',
    });
    return true;
  }
}
