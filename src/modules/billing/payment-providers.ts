import { createHmac } from 'node:crypto';

export interface WebhookInput {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  parsedBody: any;
}

/**
 * What a *successful* payment webhook tells us, normalised across gateways.
 *
 * `orderRef` is how a webhook finds the PENDING payment row that order
 * creation wrote; `paymentRef` is the gateway's id for the money itself and is
 * what a later refund call needs.
 */
export interface SettlementHint {
  orderRef?: string;
  paymentRef?: string;
  amountPaise?: number;
  currency?: string;
  method?: string;
}

export interface PaymentProvider {
  key: 'razorpay' | 'cashfree';
  verifySignature(input: WebhookInput, secret: string): boolean;
  extractEventId(input: WebhookInput): string;
  extractEventType(input: WebhookInput): string;
  /**
   * Non-null only for an event that means "money captured". Everything else —
   * authorizations, failures, disputes — returns null and is recorded without
   * touching a subscription.
   */
  extractSettlement(input: WebhookInput): SettlementHint | null;
}

export class RazorpayProvider implements PaymentProvider {
  key = 'razorpay' as const;
  verifySignature(input: WebhookInput, secret: string): boolean {
    const sig = (input.headers['x-razorpay-signature'] as string) ?? '';
    if (!sig) return false;
    const expected = createHmac('sha256', secret).update(input.rawBody).digest('hex');
    return sig === expected;
  }
  extractEventId(input: WebhookInput): string {
    return (
      input.parsedBody?.payload?.payment?.entity?.id ?? input.parsedBody?.id ?? String(Date.now())
    );
  }
  extractEventType(input: WebhookInput): string {
    return input.parsedBody?.event ?? 'unknown';
  }
  extractSettlement(input: WebhookInput): SettlementHint | null {
    if (this.extractEventType(input) !== 'payment.captured') return null;
    const entity = input.parsedBody?.payload?.payment?.entity;
    if (!entity) return null;
    return {
      orderRef: entity.order_id ?? undefined,
      paymentRef: entity.id ?? undefined,
      amountPaise: typeof entity.amount === 'number' ? entity.amount : undefined,
      currency: entity.currency ?? undefined,
      method: entity.method ?? undefined,
    };
  }
}

export class CashfreeProvider implements PaymentProvider {
  key = 'cashfree' as const;
  verifySignature(input: WebhookInput, secret: string): boolean {
    const sig = (input.headers['x-webhook-signature'] as string) ?? '';
    const ts = (input.headers['x-webhook-timestamp'] as string) ?? '';
    if (!sig) return false;
    const expected = createHmac('sha256', secret)
      .update(ts + input.rawBody)
      .digest('base64');
    return sig === expected;
  }
  extractEventId(input: WebhookInput): string {
    return (
      input.parsedBody?.data?.order?.order_id ??
      input.parsedBody?.data?.payment?.cf_payment_id ??
      String(Date.now())
    );
  }
  extractEventType(input: WebhookInput): string {
    return input.parsedBody?.type ?? 'unknown';
  }
  extractSettlement(input: WebhookInput): SettlementHint | null {
    if (this.extractEventType(input) !== 'PAYMENT_SUCCESS_WEBHOOK') return null;
    const data = input.parsedBody?.data;
    if (!data) return null;
    // Cashfree reports amounts in major units; the ledger is in paise.
    const amount = data.payment?.payment_amount ?? data.order?.order_amount;
    return {
      orderRef: data.order?.order_id ?? undefined,
      paymentRef: data.payment?.cf_payment_id ? String(data.payment.cf_payment_id) : undefined,
      amountPaise: typeof amount === 'number' ? Math.round(amount * 100) : undefined,
      currency: data.payment?.payment_currency ?? data.order?.order_currency ?? undefined,
      method:
        typeof data.payment?.payment_group === 'string' ? data.payment.payment_group : undefined,
    };
  }
}

export const PROVIDERS: Record<string, PaymentProvider> = {
  razorpay: new RazorpayProvider(),
  cashfree: new CashfreeProvider(),
};
