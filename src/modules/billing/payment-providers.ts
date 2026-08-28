import { createHmac } from 'node:crypto';

export interface WebhookInput {
  headers: Record<string, string | string[] | undefined>;
  rawBody: string;
  parsedBody: any;
}

export interface PaymentProvider {
  key: 'razorpay' | 'cashfree';
  verifySignature(input: WebhookInput, secret: string): boolean;
  extractEventId(input: WebhookInput): string;
  extractEventType(input: WebhookInput): string;
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
}

export const PROVIDERS: Record<string, PaymentProvider> = {
  razorpay: new RazorpayProvider(),
  cashfree: new CashfreeProvider(),
};
