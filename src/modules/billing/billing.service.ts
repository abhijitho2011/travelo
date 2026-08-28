import { BadRequestException, Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { and, desc, eq, gte, lte, sql, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  invoices,
  owners,
  payments,
  refunds,
  subscriptions,
  webhookEvents,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { InvoiceNumberService } from './invoice-number.service';
import { PROVIDERS, WebhookInput } from './payment-providers';
import { getRequestContext } from '../../common/context/request-context';

@Injectable()
export class BillingService {
  private readonly logger = new Logger(BillingService.name);
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly invNum: InvoiceNumberService,
    private readonly config: ConfigService,
  ) {}

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

  async refundPayment(paymentId: string, dto: { amount: number; reason?: string }) {
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
      return refund;
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
    return row;
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
    return after;
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
    try {
      const [row] = await this.db
        .insert(webhookEvents)
        .values({
          provider: providerKey,
          eventId,
          eventType,
          payload: input.parsedBody,
        })
        .returning();
      // TODO: gateway call — dispatch to internal handler for eventType
      await this.db
        .update(webhookEvents)
        .set({ processedAt: new Date() })
        .where(eq(webhookEvents.id, row.id));
      return { ok: true, id: row.id, replayed: false };
    } catch (err) {
      const msg = (err as { message?: string })?.message ?? String(err);
      if (msg.includes('webhook_events_unique') || msg.includes('duplicate key')) {
        return { ok: true, replayed: true };
      }
      throw err;
    }
  }
}
