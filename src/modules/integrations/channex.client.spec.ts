import { ChannexClient } from './channex.client';
import { ChannexApiError } from './channex.errors';

/**
 * The client is the ONLY thing in this adapter that would touch the network,
 * so every test here hands it a fake `fetch`. Nothing in this file — and
 * nothing in the suite — may reach Channex staging.
 */

const KEY = 'super-secret-channex-key';

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(body),
  } as Response;
}

function textResponse(body: string, status: number): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    text: async () => body,
  } as Response;
}

/** `jest.fn()` infers an empty tuple for its args; this restores the shape. */
function callsOf(fn: jest.Mock): [string, RequestInit][] {
  return fn.mock.calls as [string, RequestInit][];
}

function build(opts: { fetchImpl: jest.Mock; enabled?: boolean; apiKey?: string }) {
  return new ChannexClient({
    baseUrl: 'https://staging.channex.io/api/v1',
    apiKey: opts.apiKey ?? KEY,
    enabled: opts.enabled ?? true,
    fetchImpl: opts.fetchImpl as unknown as typeof fetch,
  });
}

describe('ChannexClient.configured', () => {
  const fetchImpl = jest.fn();

  it('is false when the feature flag is off, key or no key', () => {
    expect(build({ fetchImpl, enabled: false }).configured).toBe(false);
  });

  it('is false when enabled but the key is missing — enabled is not enough', () => {
    expect(build({ fetchImpl, enabled: true, apiKey: '' }).configured).toBe(false);
  });

  it('is true only with both halves', () => {
    expect(build({ fetchImpl, enabled: true }).configured).toBe(true);
  });
});

describe('ChannexClient requests', () => {
  it('sends the documented user-api-key authorization header', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({ data: [] }));
    await build({ fetchImpl }).getProperties();

    const [url, init] = callsOf(fetchImpl)[0];
    expect(url).toBe('https://staging.channex.io/api/v1/properties');
    expect((init.headers as Record<string, string>).Authorization).toBe(`user-api-key ${KEY}`);
  });

  it('filters room types and bookings by the Channex property id', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({ data: [] }));
    const client = build({ fetchImpl });
    await client.getRoomTypes('prop-1');
    await client.getBookings('prop-1', new Date('2026-08-01T00:00:00Z'));

    expect(callsOf(fetchImpl)[0][0]).toContain('/room_types?filter[property_id]=prop-1');
    expect(callsOf(fetchImpl)[1][0]).toContain('/bookings?filter[property_id]=prop-1');
    expect(callsOf(fetchImpl)[1][0]).toContain('filter[inserted_at][gte]');
  });

  it('omits the watermark on a first-ever pull rather than sending an empty one', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({ data: [] }));
    await build({ fetchImpl }).getBookings('prop-1');
    expect(callsOf(fetchImpl)[0][0]).not.toContain('inserted_at');
  });

  it('batches availability into a single POST and skips the call when empty', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({}));
    const client = build({ fetchImpl });

    expect(await client.pushAvailability('prop-1', [])).toEqual({ accepted: 0 });
    expect(fetchImpl).not.toHaveBeenCalled();

    const res = await client.pushAvailability('prop-1', [
      {
        property_id: 'ignored',
        room_type_id: 'crt-1',
        date_from: '2026-09-01',
        date_to: '2026-09-03',
        availability: 4,
      },
    ]);
    expect(res).toEqual({ accepted: 1 });
    const body = JSON.parse(callsOf(fetchImpl)[0][1].body as string);
    // The caller's property_id always wins over whatever the range carried.
    expect(body.values[0].property_id).toBe('prop-1');
  });

  it('pushes rates against /restrictions, where Channex keeps `rate`', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({}));
    await build({ fetchImpl }).pushRates('prop-1', [
      {
        property_id: 'prop-1',
        rate_plan_id: 'rp-1',
        date_from: '2026-09-01',
        date_to: '2026-09-30',
        rate: '2500.00',
      },
    ]);
    expect(callsOf(fetchImpl)[0][0]).toContain('/restrictions');
  });

  it('POSTs a new property and PUTs an existing one', async () => {
    const fetchImpl = jest.fn(async () => jsonResponse({ data: { id: 'p1' } }));
    const client = build({ fetchImpl });
    await client.createOrUpdateProperty({ attributes: { title: 'Sea View' } });
    await client.createOrUpdateProperty({ id: 'p1', attributes: { title: 'Sea View' } });

    expect(callsOf(fetchImpl)[0][1].method).toBe('POST');
    expect(callsOf(fetchImpl)[1][1].method).toBe('PUT');
    expect(callsOf(fetchImpl)[1][0]).toContain('/properties/p1');
  });
});

describe('ChannexClient failure handling', () => {
  it('retries ONCE on a 5xx and succeeds on the second attempt', async () => {
    const fetchImpl = jest
      .fn()
      .mockResolvedValueOnce(textResponse('upstream boom', 503))
      .mockResolvedValueOnce(jsonResponse({ data: [{ id: 'p1' }] }));

    const props = await build({ fetchImpl }).getProperties();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(props).toHaveLength(1);
  });

  it('retries once on a network fault', async () => {
    const fetchImpl = jest
      .fn()
      .mockRejectedValueOnce(new Error('ECONNRESET'))
      .mockResolvedValueOnce(jsonResponse({ data: [] }));

    await build({ fetchImpl }).getProperties();
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it('does NOT retry a 4xx — a rejected payload is rejected the same way twice', async () => {
    const fetchImpl = jest.fn(async () => textResponse('{"errors":"bad room type"}', 422));

    await expect(build({ fetchImpl }).getProperties()).rejects.toBeInstanceOf(ChannexApiError);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it('maps a non-2xx to a typed error carrying the status and the RESPONSE body', async () => {
    const fetchImpl = jest.fn(async () => textResponse('room type not found', 404));
    const err = await build({ fetchImpl })
      .getRoomTypes('prop-1')
      .catch((e: unknown) => e as ChannexApiError);

    expect(err).toBeInstanceOf(ChannexApiError);
    expect((err as ChannexApiError).status).toBe(404);
    expect((err as ChannexApiError).body).toBe('room type not found');
    expect((err as ChannexApiError).summary).toContain('HTTP 404');
  });

  it('NEVER puts the API key in an error, its summary or its stack', async () => {
    // The single most damaging thing this adapter could do is leak the key
    // into a place a human reads — an error, a log line, a sync-log row.
    const fetchImpl = jest.fn(async () => textResponse('nope', 500));
    const err = await build({ fetchImpl })
      .getProperties()
      .catch((e: unknown) => e as ChannexApiError);

    const rendered = `${(err as Error).message}|${(err as ChannexApiError).summary}|${
      (err as Error).stack ?? ''
    }|${JSON.stringify(err)}`;
    expect(rendered).not.toContain(KEY);
  });

  it('tolerates an empty 2xx body rather than throwing on JSON.parse', async () => {
    const fetchImpl = jest.fn(async () => textResponse('', 204));
    await expect(build({ fetchImpl }).pushRates('prop-1', [])).resolves.toEqual({ accepted: 0 });

    const fetchImpl2 = jest.fn(async () => textResponse('', 204));
    await expect(build({ fetchImpl: fetchImpl2 }).getProperties()).resolves.toEqual([]);
  });
});
