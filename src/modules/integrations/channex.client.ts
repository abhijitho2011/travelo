import { Injectable, Logger } from '@nestjs/common';
import { ChannexApiError } from './channex.errors';

/**
 * THE CREDENTIAL BOUNDARY for Channex.
 *
 * Everything that needs an API key lives behind `configured`. With the key
 * missing or CHANNEX_ENABLED false this object never opens a socket, and the
 * sync service turns that into a typed CHANNEX_NOT_CONFIGURED — so the whole
 * adapter above this line is exercisable, and tested, without credentials.
 *
 * Deliberately no SDK. Six JSON calls against a documented REST API do not
 * justify a dependency that would have to be audited, pinned and kept current
 * — the same call the Razorpay client makes.
 *
 * THE API KEY NEVER LEAVES THIS FILE'S HEADERS. It is not logged, not echoed
 * into an error, and not written to `channex_sync_log`: `ChannexApiError`
 * carries the status, the path and the RESPONSE body only.
 */

// ---------- Wire shapes (JSON:API-flavoured, as Channex documents them) ----------

export interface ChannexResource<A> {
  id: string;
  type: string;
  attributes: A;
}

export interface ChannexPropertyAttributes {
  title?: string;
  currency?: string;
  timezone?: string;
  [k: string]: unknown;
}

export interface ChannexRoomTypeAttributes {
  title?: string;
  count_of_rooms?: number;
  occupancy?: number;
  [k: string]: unknown;
}

/** One night-range of availability for one room type. `to` is INCLUSIVE here —
 * Channex's date_to is inclusive, unlike Tavelo's exclusive `check_out`. The
 * conversion happens in the sync service, once. */
export interface ChannexAvailabilityUpdate {
  property_id: string;
  room_type_id: string;
  date_from: string;
  date_to: string;
  availability: number;
}

export interface ChannexRateUpdate {
  property_id: string;
  rate_plan_id: string;
  date_from: string;
  date_to: string;
  /** Major units, as Channex expects — paise are divided by 100 upstream. */
  rate: string;
}

export interface ChannexBookingRoom {
  room_type_id?: string;
  rate_plan_id?: string;
  checkin_date?: string;
  checkout_date?: string;
  amount?: string;
  occupancy?: { adults?: number; children?: number };
}

export interface ChannexBookingAttributes {
  ota_reservation_code?: string;
  status?: string;
  arrival_date?: string;
  departure_date?: string;
  currency?: string;
  amount?: string;
  customer?: {
    name?: string;
    surname?: string;
    mail?: string;
    phone?: string;
  };
  rooms?: ChannexBookingRoom[];
  [k: string]: unknown;
}

export type ChannexBooking = ChannexResource<ChannexBookingAttributes>;

export interface ChannexClientOptions {
  baseUrl: string;
  apiKey?: string;
  enabled: boolean;
  /** Injected in tests. Defaults to the global fetch. */
  fetchImpl?: typeof fetch;
}

const RETRY_DELAY_MS = 500;

@Injectable()
export class ChannexClient {
  private readonly log = new Logger(ChannexClient.name);
  private readonly baseUrl: string;
  private readonly apiKey: string;
  private readonly enabled: boolean;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: ChannexClientOptions) {
    this.baseUrl = (opts.baseUrl || '').replace(/\/+$/, '');
    this.apiKey = opts.apiKey?.trim() ?? '';
    this.enabled = opts.enabled;
    this.fetchImpl = opts.fetchImpl ?? ((...a: Parameters<typeof fetch>) => fetch(...a));
  }

  /** Enabled AND holding a key. Both halves, or the adapter stays inert. */
  get configured(): boolean {
    return this.enabled && this.apiKey.length > 0;
  }

  /** One clear boot line, so an operator can tell inert from broken. */
  logBootState(): void {
    if (this.configured) {
      this.log.log(`Channex enabled against ${this.baseUrl}`);
    } else if (this.enabled) {
      this.log.warn('Channex is enabled but CHANNEX_API_KEY is unset — adapter is INERT');
    } else {
      this.log.log('Channex disabled (CHANNEX_ENABLED=false) — adapter is INERT');
    }
  }

  // ---------- Endpoints ----------

  async getProperties(): Promise<ChannexResource<ChannexPropertyAttributes>[]> {
    const res = await this.send<{ data: ChannexResource<ChannexPropertyAttributes>[] }>(
      'GET',
      '/properties',
    );
    return res.data ?? [];
  }

  /**
   * Create when `id` is absent, update when present. Channex wraps the body in
   * a `property` envelope and answers with the single resource.
   */
  async createOrUpdateProperty(input: {
    id?: string;
    attributes: ChannexPropertyAttributes;
  }): Promise<ChannexResource<ChannexPropertyAttributes>> {
    const path = input.id ? `/properties/${encodeURIComponent(input.id)}` : '/properties';
    const res = await this.send<{ data: ChannexResource<ChannexPropertyAttributes> }>(
      input.id ? 'PUT' : 'POST',
      path,
      { property: input.attributes },
    );
    return res.data;
  }

  async getRoomTypes(propertyId: string): Promise<ChannexResource<ChannexRoomTypeAttributes>[]> {
    const res = await this.send<{ data: ChannexResource<ChannexRoomTypeAttributes>[] }>(
      'GET',
      `/room_types?filter[property_id]=${encodeURIComponent(propertyId)}`,
    );
    return res.data ?? [];
  }

  /** `POST /availability` takes a batch of ranges in one call. */
  async pushAvailability(
    propertyId: string,
    updates: ChannexAvailabilityUpdate[],
  ): Promise<{ accepted: number }> {
    if (updates.length === 0) return { accepted: 0 };
    await this.send('POST', '/availability', {
      values: updates.map((u) => ({ ...u, property_id: propertyId })),
    });
    return { accepted: updates.length };
  }

  /** Rates ride on `/restrictions`, which is where Channex keeps `rate`. */
  async pushRates(propertyId: string, updates: ChannexRateUpdate[]): Promise<{ accepted: number }> {
    if (updates.length === 0) return { accepted: 0 };
    await this.send('POST', '/restrictions', {
      values: updates.map((u) => ({ ...u, property_id: propertyId })),
    });
    return { accepted: updates.length };
  }

  /**
   * Bookings inserted since `since`. `since` is optional: a first-ever run has
   * no watermark and must pull the full current window rather than nothing.
   */
  async getBookings(propertyId: string, since?: Date): Promise<ChannexBooking[]> {
    let path = `/bookings?filter[property_id]=${encodeURIComponent(propertyId)}`;
    if (since) path += `&filter[inserted_at][gte]=${encodeURIComponent(since.toISOString())}`;
    const res = await this.send<{ data: ChannexBooking[] }>('GET', path);
    return res.data ?? [];
  }

  // ---------- Transport ----------

  /**
   * One retry on a 5xx or a network fault, then give up. A 4xx is never
   * retried: a rejected payload is rejected the same way twice, and hammering
   * a channel manager with it is how an integration gets rate-limited.
   */
  private async send<T>(method: string, path: string, body?: unknown): Promise<T> {
    try {
      return await this.attempt<T>(method, path, body);
    } catch (err) {
      const retriable = err instanceof ChannexApiError ? err.status >= 500 : true;
      if (!retriable) throw err;
      await new Promise((r) => setTimeout(r, RETRY_DELAY_MS));
      return this.attempt<T>(method, path, body);
    }
  }

  private async attempt<T>(method: string, path: string, body?: unknown): Promise<T> {
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        // The only place the key ever appears.
        Authorization: `user-api-key ${this.apiKey}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      // Path and response body only — never the request headers.
      this.log.warn(`Channex ${method} ${path} responded ${res.status}`);
      throw new ChannexApiError(res.status, path, text);
    }
    if (!text) return {} as T;
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ChannexApiError(res.status, path, 'non-JSON body');
    }
  }
}
