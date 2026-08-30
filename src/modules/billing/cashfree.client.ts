import { request } from 'node:https';
import { Injectable, Logger } from '@nestjs/common';

/**
 * The credential boundary for Cashfree — the mirror of RazorpayClient.
 *
 * With no keys set the platform still takes money through the manual-payment
 * path, and gateway order creation returns a typed GATEWAY_NOT_CONFIGURED
 * rather than throwing. No SDK: one POST with two header credentials does not
 * justify a dependency that must be audited, pinned and kept current.
 *
 * Sandbox vs production is selected by CASHFREE_ENV (default 'sandbox').
 */

export const CASHFREE_HOSTS = {
  sandbox: 'sandbox.cashfree.com',
  production: 'api.cashfree.com',
} as const;

export interface CashfreeOrder {
  /** Our order id, echoed back — this is the webhook's orderRef. */
  order_id: string;
  /** Handed to the Cashfree checkout widget to collect the payment. */
  payment_session_id: string;
  order_status: string;
  order_amount: number;
  order_currency: string;
}

@Injectable()
export class CashfreeClient {
  private readonly log = new Logger(CashfreeClient.name);
  private readonly appId: string;
  private readonly secret: string;
  private readonly host: string;
  private readonly apiVersion: string;

  constructor(env: NodeJS.ProcessEnv = process.env) {
    this.appId = env.CASHFREE_APP_ID?.trim() ?? '';
    this.secret = env.CASHFREE_SECRET_KEY?.trim() ?? '';
    const mode = env.CASHFREE_ENV?.trim() === 'production' ? 'production' : 'sandbox';
    this.host = CASHFREE_HOSTS[mode];
    // Cashfree pins behaviour to a dated API version sent as a header.
    this.apiVersion = env.CASHFREE_API_VERSION?.trim() || '2023-08-01';
  }

  /** True only when BOTH halves of the credential pair are present. */
  get configured(): boolean {
    return !!(this.appId && this.secret);
  }

  /** Publishable half — safe to hand to a checkout widget alongside the session id. */
  get publicAppId(): string {
    return this.appId;
  }

  /**
   * Creates a Cashfree order. Cashfree works in MAJOR currency units, so the
   * caller's paise amount is converted here — the inverse of the /100 the
   * webhook parser applies on the way back in.
   */
  async createOrder(input: {
    amountPaise: number;
    currency: string;
    orderId: string;
    customerId: string;
    notes?: Record<string, string>;
  }): Promise<CashfreeOrder> {
    return this.post<CashfreeOrder>('/pg/orders', {
      order_id: input.orderId,
      order_amount: Math.round(input.amountPaise) / 100,
      order_currency: input.currency,
      customer_details: {
        customer_id: input.customerId,
        // Cashfree requires a contact field; a stable placeholder keeps the
        // server-to-server order call working when the owner has no phone on
        // file. The real contact is collected by the checkout widget.
        customer_phone: '9999999999',
      },
      order_note: input.notes ? JSON.stringify(input.notes).slice(0, 200) : undefined,
    });
  }

  /** Minimal HTTPS POST with Cashfree's header auth. Rejects on any non-2xx. */
  private post<T>(path: string, body: unknown): Promise<T> {
    const payload = JSON.stringify(body);
    return new Promise<T>((resolve, reject) => {
      const req = request(
        {
          host: this.host,
          path,
          method: 'POST',
          timeout: 15_000,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            'x-api-version': this.apiVersion,
            'x-client-id': this.appId,
            'x-client-secret': this.secret,
          },
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c: Buffer) => chunks.push(c));
          res.on('end', () => {
            const text = Buffer.concat(chunks).toString('utf8');
            const status = res.statusCode ?? 0;
            if (status < 200 || status >= 300) {
              this.log.warn(`Cashfree ${path} responded ${status}: ${text.slice(0, 500)}`);
              reject(new Error(`Cashfree ${path} failed with ${status}`));
              return;
            }
            try {
              resolve(JSON.parse(text) as T);
            } catch {
              reject(new Error(`Cashfree ${path} returned a non-JSON body`));
            }
          });
        },
      );
      req.on('timeout', () => req.destroy(new Error(`Cashfree ${path} timed out`)));
      req.on('error', reject);
      req.write(payload);
      req.end();
    });
  }
}
