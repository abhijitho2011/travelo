import { request } from 'node:https';
import { Injectable, Logger } from '@nestjs/common';

/**
 * The credential boundary for Razorpay.
 *
 * Everything gateway-shaped lives behind `configured`. With no keys set the
 * platform still takes money — through the manual-payment path — and every
 * gateway entry point returns a typed GATEWAY_NOT_CONFIGURED instead of
 * throwing something the console cannot explain to a finance admin.
 *
 * Deliberately no SDK: two POSTs with basic auth do not justify a dependency
 * that would have to be audited, pinned and kept current.
 */

export const RAZORPAY_API_HOST = 'api.razorpay.com';

export interface RazorpayOrder {
  id: string;
  amount: number;
  currency: string;
  status: string;
  receipt?: string;
}

export interface RazorpayRefund {
  id: string;
  amount: number;
  status: string;
  /** Our refund row id, echoed back — the handle idempotency hangs on. */
  receipt?: string | null;
}

@Injectable()
export class RazorpayClient {
  private readonly log = new Logger(RazorpayClient.name);
  private readonly keyId: string;
  private readonly keySecret: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.keyId = env.RAZORPAY_KEY_ID?.trim() ?? '';
    this.keySecret = env.RAZORPAY_KEY_SECRET?.trim() ?? '';
  }

  /** True only when BOTH halves of the credential pair are present. */
  get configured(): boolean {
    return !!(this.keyId && this.keySecret);
  }

  /** Publishable half of the pair — safe to hand to a checkout widget. */
  get publicKeyId(): string {
    return this.keyId;
  }

  async createOrder(input: {
    amountPaise: number;
    currency: string;
    receipt: string;
    notes?: Record<string, string>;
  }): Promise<RazorpayOrder> {
    return this.post<RazorpayOrder>('/v1/orders', {
      amount: input.amountPaise,
      currency: input.currency,
      receipt: input.receipt,
      notes: input.notes ?? {},
      payment_capture: 1,
    });
  }

  /**
   * `receipt` is our own refund row id (Razorpay allows 40 chars; a UUID is
   * 36). It is the only durable link between their refund and our row, and
   * what `findRefundByReceipt` keys on so a retry never refunds twice.
   */
  async createRefund(
    paymentRef: string,
    amountPaise: number,
    receipt?: string,
  ): Promise<RazorpayRefund> {
    return this.post<RazorpayRefund>(`/v1/payments/${encodeURIComponent(paymentRef)}/refund`, {
      amount: amountPaise,
      ...(receipt ? { receipt } : {}),
    });
  }

  /** Every refund Razorpay holds against one payment. */
  async listRefunds(paymentRef: string): Promise<RazorpayRefund[]> {
    const page = await this.get<{ items?: RazorpayRefund[] }>(
      `/v1/payments/${encodeURIComponent(paymentRef)}/refunds`,
    );
    return page.items ?? [];
  }

  /** The refund already created for `receipt`, if any — the idempotency read. */
  async findRefundByReceipt(paymentRef: string, receipt: string): Promise<RazorpayRefund | null> {
    const all = await this.listRefunds(paymentRef);
    return all.find((r) => r.receipt === receipt) ?? null;
  }

  private post<T>(path: string, body: unknown): Promise<T> {
    return this.send<T>('POST', path, JSON.stringify(body));
  }

  private get<T>(path: string): Promise<T> {
    return this.send<T>('GET', path);
  }

  /** Minimal HTTPS call with basic auth. Rejects on any non-2xx. */
  private send<T>(method: 'GET' | 'POST', path: string, payload?: string): Promise<T> {
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    return new Promise<T>((resolve, reject) => {
      const req = request(
        {
          host: RAZORPAY_API_HOST,
          path,
          method,
          timeout: 15_000,
          headers: {
            Authorization: `Basic ${auth}`,
            ...(payload !== undefined
              ? { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
              : {}),
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            const status = res.statusCode ?? 0;
            if (status < 200 || status >= 300) {
              this.log.warn(`Razorpay ${path} responded ${status}: ${text.slice(0, 500)}`);
              reject(new Error(`Razorpay ${path} failed with ${status}`));
              return;
            }
            try {
              resolve(JSON.parse(text) as T);
            } catch {
              reject(new Error(`Razorpay ${path} returned a non-JSON body`));
            }
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error(`Razorpay ${path} timed out`)));
      req.on('error', reject);
      if (payload !== undefined) req.write(payload);
      req.end();
    });
  }
}
