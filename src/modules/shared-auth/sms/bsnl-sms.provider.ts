import { Injectable, Logger } from '@nestjs/common';
import * as https from 'node:https';
import * as http from 'node:http';
import { URL } from 'node:url';
import { AppEnv } from '../../../config/env';
import { SmsProvider, SmsTextNotConfiguredError } from './sms-provider.interface';

interface HttpJsonResponse {
  status: number;
  data: Record<string, unknown> | null;
  raw: string;
}

/**
 * BSNL DLT SMS provider.
 * - Caches the API token in memory (~23h), refreshes proactively.
 * - Invalidates + retries once on an "Invalid Token" style error.
 * - Payload shape follows the BSNL Send_SMS contract; the DLT template
 *   variable key is configurable via BSNL_TEMPLATE_VAR_KEY.
 */
@Injectable()
export class BsnlSmsProvider implements SmsProvider {
  private readonly logger = new Logger('BsnlSmsProvider');
  private token: string | null = null;
  private tokenExpiresAt = 0;
  private static readonly TOKEN_TTL_MS = 23 * 60 * 60 * 1000; // ~23h

  constructor(private readonly env: AppEnv) {}

  async sendOtp(mobile: string, otp: string): Promise<void> {
    await this.sendWithRetry(mobile, otp);
  }

  /**
   * Non-OTP notification SMS. DLT binds every message to a registered content
   * template, so this needs its OWN template id — the OTP template must not
   * carry a notification body. Without one configured this refuses rather than
   * sending something the regulator would reject.
   */
  async sendText(mobile: string, body: string): Promise<void> {
    const templateId = this.env.BSNL_NOTIFY_TEMPLATE_ID;
    if (!templateId) {
      throw new SmsTextNotConfiguredError(
        'BSNL_NOTIFY_TEMPLATE_ID is not set — no DLT template registered for notification SMS',
      );
    }
    await this.sendWithRetry(mobile, body, templateId, this.env.BSNL_NOTIFY_VAR_KEY);
  }

  private async sendWithRetry(
    mobile: string,
    value: string,
    templateId?: string,
    varKey?: string,
  ): Promise<void> {
    try {
      await this.send(mobile, value, templateId, varKey);
    } catch (err) {
      const message = (err as Error).message ?? '';
      if (/invalid token/i.test(message)) {
        // Token likely expired/rejected server-side — refresh once and retry.
        this.token = null;
        this.tokenExpiresAt = 0;
        await this.send(mobile, value, templateId, varKey);
        return;
      }
      throw err;
    }
  }

  /** Build the BSNL Send_SMS payload. Exposed for unit testing the shape. */
  buildPayload(
    mobile: string,
    otp: string,
    templateId?: string,
    varKey?: string,
  ): Record<string, unknown> {
    const payload: Record<string, unknown> = {
      Header: this.env.BSNL_HEADER,
      Target: mobile,
      Is_Unicode: '0',
      Is_Flash: '0',
      Message_Type: 'TXN',
      Entity_Id: this.env.BSNL_ENTITY_ID,
      Content_Template_Id: templateId ?? this.env.BSNL_TEMPLATE_ID,
      Template_Keys_and_Values: [{ Key: varKey ?? this.env.BSNL_TEMPLATE_VAR_KEY, Value: otp }],
    };
    if (this.env.BSNL_SERVICE_ID) payload.Service_Id = this.env.BSNL_SERVICE_ID;
    return payload;
  }

  private async send(
    mobile: string,
    otp: string,
    templateId?: string,
    varKey?: string,
  ): Promise<void> {
    const token = await this.getToken();
    const url = this.join(this.env.BSNL_SEND_PATH);
    const res = await this.postJson(url, this.buildPayload(mobile, otp, templateId, varKey), {
      Authorization: `Bearer ${token}`,
    });
    if (res.data && res.data.Error) {
      throw new Error(`BSNL Send_SMS error: ${JSON.stringify(res.data.Error)}`);
    }
    if (res.status >= 400) {
      throw new Error(`BSNL Send_SMS HTTP ${res.status}`);
    }
  }

  /** Build the token-creation body. All four fields are required by BSNL. */
  buildTokenBody(): Record<string, unknown> {
    return {
      Username: this.env.BSNL_USERNAME,
      Password: this.env.BSNL_PASSWORD,
      Service_Id: this.env.BSNL_SERVICE_ID,
      Token_Id: this.env.BSNL_TOKEN_ID,
    };
  }

  private async getToken(): Promise<string> {
    if (this.token && Date.now() < this.tokenExpiresAt) return this.token;
    const url = this.join(this.env.BSNL_TOKEN_PATH);
    const res = await this.postJson(url, this.buildTokenBody());
    if (res.status >= 400) {
      throw new Error(`BSNL token error HTTP ${res.status}: ${res.raw.slice(0, 300)}`);
    }
    if (res.data && res.data.Error) {
      throw new Error(`BSNL token error: ${JSON.stringify(res.data.Error)}`);
    }
    // The endpoint returns the RAW JWT as the plaintext body (not JSON).
    const trimmed = res.raw.trim();
    const looksLikeJwt = trimmed.split('.').length === 3 && !/\s/.test(trimmed);
    const data = res.data ?? {};
    const token = looksLikeJwt
      ? trimmed
      : ((data.Token as string) ??
        (data.token as string) ??
        (data.jwt as string) ??
        ((data.data as Record<string, unknown> | undefined)?.Token as string));
    if (!token) {
      throw new Error('BSNL token response did not contain a token');
    }
    this.token = token;
    this.tokenExpiresAt = Date.now() + BsnlSmsProvider.TOKEN_TTL_MS;
    return token;
  }

  /**
   * Diagnostics: fetch the DLT content-template details so template-key
   * mismatches can be debugged in production. NOT called on every send.
   */
  async getTemplateDetails(): Promise<Record<string, unknown> | null> {
    const token = await this.getToken();
    const url = this.join('/api/Get_Content_Template_Details');
    const res = await this.postJson(
      url,
      {
        Content_Template_Id: this.env.BSNL_TEMPLATE_ID,
        Entity_Id: this.env.BSNL_ENTITY_ID,
      },
      { Authorization: `Bearer ${token}` },
    );
    if (res.status >= 400) {
      throw new Error(`BSNL template lookup HTTP ${res.status}: ${res.raw.slice(0, 300)}`);
    }
    return res.data;
  }

  private join(pathname: string): string {
    const base = (this.env.BSNL_BASE_URL ?? '').replace(/\/+$/, '');
    const suffix = pathname.startsWith('/') ? pathname : `/${pathname}`;
    return `${base}${suffix}`;
  }

  private postJson(
    urlStr: string,
    body: unknown,
    headers: Record<string, string> = {},
  ): Promise<HttpJsonResponse> {
    return new Promise((resolve, reject) => {
      let url: URL;
      try {
        url = new URL(urlStr);
      } catch {
        reject(new Error(`Invalid BSNL URL: ${urlStr}`));
        return;
      }
      const payload = Buffer.from(JSON.stringify(body));
      const isHttps = url.protocol === 'https:';
      const transport = isHttps ? https : http;
      const agent =
        isHttps && this.env.BSNL_INSECURE_TLS
          ? new https.Agent({ rejectUnauthorized: false })
          : undefined;
      const req = transport.request(
        {
          protocol: url.protocol,
          hostname: url.hostname,
          port: url.port || (isHttps ? 443 : 80),
          path: `${url.pathname}${url.search}`,
          method: 'POST',
          agent,
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': payload.length,
            ...headers,
          },
          timeout: 15000,
        },
        (res) => {
          const chunks: Buffer[] = [];
          res.on('data', (c) => chunks.push(c as Buffer));
          res.on('end', () => {
            const raw = Buffer.concat(chunks).toString('utf8');
            let data: Record<string, unknown> | null = null;
            try {
              data = raw ? (JSON.parse(raw) as Record<string, unknown>) : null;
            } catch {
              data = null;
            }
            resolve({ status: res.statusCode ?? 0, data, raw });
          });
        },
      );
      req.on('error', reject);
      req.on('timeout', () => {
        req.destroy(new Error('BSNL request timed out'));
      });
      req.write(payload);
      req.end();
    });
  }
}
