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

  async createRefund(paymentRef: string, amountPaise: number): Promise<RazorpayRefund> {
    return this.post<RazorpayRefund>(`/v1/payments/${encodeURIComponent(paymentRef)}/refund`, {
      amount: amountPaise,
    });
  }

  /** Minimal HTTPS POST with basic auth. Rejects on any non-2xx. */
  private post<T>(path: string, body: unknown): Promise<T> {
    const payload = JSON.stringify(body);
    const auth = Buffer.from(`${this.keyId}:${this.keySecret}`).toString('base64');
    return new Promise<T>((resolve, reject) => {
      const req = request(
        {
          host: RAZORPAY_API_HOST,
          path,
          method: 'POST',
          timeout: 15_000,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            Authorization: `Basic ${auth}`,
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
      req.write(payload);
      req.end();
    });
  }
}
