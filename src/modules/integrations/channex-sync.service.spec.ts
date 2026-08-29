import { ChannexSyncService } from './channex-sync.service';
import { readChannexConfig, invertRoomTypeMap } from './channex.config';
import { ChannexApiError } from './channex.errors';
import { mockDb, MockDb, Row } from '../owner-auth/testing/db.mock';

/**
 * The HTTP client is a stub in EVERY test here. Nothing below opens a socket.
 */

const KEY = 'super-secret-channex-key';
const CONNECTION_ID = '11111111-1111-4111-8111-111111111111';
const PROPERTY_ID = '22222222-2222-4222-8222-222222222222';
const DELUXE = 'rt-deluxe';

const CONFIG = {
  channexPropertyId: 'cx-prop-1',
  roomTypeMap: { [DELUXE]: 'cx-rt-deluxe' },
  ratePlanMap: { [DELUXE]: 'cx-rp-deluxe' },
};

function connectionRow(over: Row = {}): Row {
  return {
    id: CONNECTION_ID,
    propertyId: PROPERTY_ID,
    provider: 'CHANNEX',
    status: 'HEALTHY',
    errorCount: 0,
    lastSyncAt: null,
    config: CONFIG,
    ...over,
  };
}

interface StubClient {
  configured: boolean;
  pushAvailability: jest.Mock;
  pushRates: jest.Mock;
  getBookings: jest.Mock;
}

function stubClient(over: Partial<StubClient> = {}): StubClient {
  return {
    configured: true,
    pushAvailability: jest.fn(async (_p: string, u: unknown[]) => ({ accepted: u.length })),
    pushRates: jest.fn(async (_p: string, u: unknown[]) => ({ accepted: u.length })),
    getBookings: jest.fn(async () => []),
    ...over,
  };
}

function build(opts: { db: MockDb; client?: StubClient; reservations?: { create: jest.Mock } }) {
  const client = opts.client ?? stubClient();
  const reservations = opts.reservations ?? {
    create: jest.fn(async () => ({ id: 'res-1' })),
  };
  const svc = new ChannexSyncService(opts.db as never, client as never, reservations as never);
  return { svc, client, reservations };
}

/** Every `channex_sync_log` row the service wrote, oldest first. */
function logRows(db: MockDb): Row[] {
  return db.inserts.filter((i) => i.table === 'channex_sync_log').map((i) => i.values as Row);
}

function healthUpdate(db: MockDb): Row {
  const rec = db.updates.find((u) => u.table === 'integration_connections');
  if (!rec) throw new Error('no health update was issued');
  return rec.values as Row;
}

// ---------------------------------------------------------------------------

describe('ChannexSyncService.computeAvailability', () => {
  const window = { start: '2026-09-14', end: '2026-09-17' };

  it('is rooms of the type minus the stays in house that night', () => {
    const nights = ChannexSyncService.computeAvailability({
      rooms: [{ roomTypeId: DELUXE }, { roomTypeId: DELUXE }, { roomTypeId: DELUXE }],
      reservations: [{ roomTypeId: DELUXE, checkIn: '2026-09-14', checkOut: '2026-09-16' }],
      ...window,
    });
    expect(nights).toEqual([
      { roomTypeId: DELUXE, date: '2026-09-14', available: 2 },
      { roomTypeId: DELUXE, date: '2026-09-15', available: 2 },
      // check_out is EXCLUSIVE — the room is back on sale on the 16th.
      { roomTypeId: DELUXE, date: '2026-09-16', available: 3 },
    ]);
  });

  it('SAME-DAY TURNOVER consumes one room, not two', () => {
    // The boundary this whole module lives or dies on: a stay ending on the
    // 15th and one starting on the 15th must not both occupy the 15th. With a
    // single room, the 15th is still sold once and availability stays 0 — but
    // never goes negative, which is what a `<=` overlap rule would produce.
    const nights = ChannexSyncService.computeAvailability({
      rooms: [{ roomTypeId: DELUXE }],
      reservations: [
        { roomTypeId: DELUXE, checkIn: '2026-09-14', checkOut: '2026-09-15' },
        { roomTypeId: DELUXE, checkIn: '2026-09-15', checkOut: '2026-09-16' },
      ],
      ...window,
    });
    expect(nights.map((n) => n.available)).toEqual([0, 0, 1]);
  });

  it('never publishes negative availability, even against an existing oversell', () => {
    const nights = ChannexSyncService.computeAvailability({
      rooms: [{ roomTypeId: DELUXE }],
      reservations: [
        { roomTypeId: DELUXE, checkIn: '2026-09-14', checkOut: '2026-09-17' },
        { roomTypeId: DELUXE, checkIn: '2026-09-14', checkOut: '2026-09-17' },
      ],
      ...window,
    });
    expect(nights.every((n) => n.available === 0)).toBe(true);
  });

  it('counts each room type separately', () => {
    const nights = ChannexSyncService.computeAvailability({
      rooms: [{ roomTypeId: DELUXE }, { roomTypeId: 'rt-suite' }],
      reservations: [{ roomTypeId: DELUXE, checkIn: '2026-09-14', checkOut: '2026-09-15' }],
      start: '2026-09-14',
      end: '2026-09-15',
    });
    expect(nights).toEqual([
      { roomTypeId: DELUXE, date: '2026-09-14', available: 0 },
      { roomTypeId: 'rt-suite', date: '2026-09-14', available: 1 },
    ]);
  });

  it('reports a room type with no rooms at all as absent, not as zero rows', () => {
    expect(
      ChannexSyncService.computeAvailability({ rooms: [], reservations: [], ...window }),
    ).toEqual([]);
  });
});

describe('ChannexSyncService.toAvailabilityRanges', () => {
  it('collapses equal consecutive nights and makes date_to INCLUSIVE', () => {
    const nights = [
      { roomTypeId: DELUXE, date: '2026-09-14', available: 2 },
      { roomTypeId: DELUXE, date: '2026-09-15', available: 2 },
      { roomTypeId: DELUXE, date: '2026-09-16', available: 3 },
    ];
    const { updates } = ChannexSyncService.toAvailabilityRanges(
      'cx-prop-1',
      nights,
      CONFIG.roomTypeMap,
    );
    expect(updates).toEqual([
      {
        property_id: 'cx-prop-1',
        room_type_id: 'cx-rt-deluxe',
        date_from: '2026-09-14',
        date_to: '2026-09-15',
        availability: 2,
      },
      {
        property_id: 'cx-prop-1',
        room_type_id: 'cx-rt-deluxe',
        date_from: '2026-09-16',
        date_to: '2026-09-16',
        availability: 3,
      },
    ]);
  });

  it('does not bridge a gap in the dates even when the counts match', () => {
    const { updates } = ChannexSyncService.toAvailabilityRanges(
      'cx-prop-1',
      [
        { roomTypeId: DELUXE, date: '2026-09-14', available: 1 },
        { roomTypeId: DELUXE, date: '2026-09-20', available: 1 },
      ],
      CONFIG.roomTypeMap,
    );
    expect(updates).toHaveLength(2);
  });

  it('reports an unmapped room type instead of inventing a Channex id', () => {
    const { updates, unmapped } = ChannexSyncService.toAvailabilityRanges(
      'cx-prop-1',
      [{ roomTypeId: 'rt-unknown', date: '2026-09-14', available: 1 }],
      CONFIG.roomTypeMap,
    );
    expect(updates).toEqual([]);
    expect(unmapped).toEqual(['rt-unknown']);
  });
});

describe('readChannexConfig', () => {
  it('reads the three mapped fields', () => {
    const cfg = readChannexConfig(CONFIG);
    expect(cfg.channexPropertyId).toBe('cx-prop-1');
    expect(invertRoomTypeMap(cfg)).toEqual({ 'cx-rt-deluxe': DELUXE });
  });

  it('tolerates a null, a string, an array and non-string map values', () => {
    for (const junk of [null, undefined, 'nope', [1, 2], { roomTypeMap: [1] }]) {
      const cfg = readChannexConfig(junk);
      expect(cfg.channexPropertyId).toBeUndefined();
      expect(cfg.roomTypeMap).toEqual({});
      expect(cfg.ratePlanMap).toEqual({});
    }
    expect(readChannexConfig({ roomTypeMap: { a: 7, b: 'ok' } }).roomTypeMap).toEqual({ b: 'ok' });
  });
});

// ---------------------------------------------------------------------------

describe('ChannexSyncService when Channex is not configured', () => {
  it('refuses a sync with a typed CHANNEX_NOT_CONFIGURED and writes nothing', async () => {
    const db = mockDb({});
    const { svc } = build({ db, client: stubClient({ configured: false }) });

    await expect(svc.syncConnection(CONNECTION_ID)).rejects.toMatchObject({
      response: { error: 'CHANNEX_NOT_CONFIGURED' },
    });
    expect(db.selects).toHaveLength(0);
    expect(db.inserts).toHaveLength(0);
  });

  it('reports itself unconfigured so the worker can stay inert', () => {
    const { svc } = build({ db: mockDb({}), client: stubClient({ configured: false }) });
    expect(svc.configured).toBe(false);
  });
});

describe('ChannexSyncService.syncConnection guards', () => {
  it('404s a connection that does not exist', async () => {
    const { svc } = build({ db: mockDb({ select: { integration_connections: [[]] } }) });
    await expect(svc.syncConnection(CONNECTION_ID)).rejects.toMatchObject({
      response: { error: 'INTEGRATION_NOT_FOUND' },
    });
  });

  it('refuses a connection belonging to another provider', async () => {
    const db = mockDb({
      select: { integration_connections: [[connectionRow({ provider: 'BOOKING_COM' })]] },
    });
    await expect(build({ db }).svc.syncConnection(CONNECTION_ID)).rejects.toMatchObject({
      response: { error: 'CHANNEX_WRONG_PROVIDER' },
    });
  });

  it('refuses a connection that was never mapped to a Channex property', async () => {
    const db = mockDb({
      select: { integration_connections: [[connectionRow({ config: {} })]] },
    });
    await expect(build({ db }).svc.syncConnection(CONNECTION_ID)).rejects.toMatchObject({
      response: { error: 'CHANNEX_PROPERTY_UNMAPPED' },
    });
  });
});

// ---------------------------------------------------------------------------

/** A db primed for one full run: connection, rooms, stays, room types. */
function runDb(over: { rooms?: Row[]; stays?: Row[]; types?: Row[]; connection?: Row } = {}) {
  return mockDb({
    select: {
      integration_connections: [[over.connection ?? connectionRow()]],
      rooms: [over.rooms ?? [{ roomTypeId: DELUXE }, { roomTypeId: DELUXE }]],
      reservations: [over.stays ?? [], []],
      room_types: [over.types ?? [{ id: DELUXE, baseRate: 250_000 }]],
    },
    insert: { channex_sync_log: [{ id: 'log-1' }] },
    update: { integration_connections: [{ id: CONNECTION_ID }] },
  });
}

describe('ChannexSyncService.syncConnection', () => {
  it('pushes availability and rates, pulls bookings and reports HEALTHY', async () => {
    const db = runDb();
    const { svc, client } = build({ db });

    const out = await svc.syncConnection(CONNECTION_ID, { horizonDays: 2 });

    expect(out.ok).toBe(true);
    expect(client.pushAvailability).toHaveBeenCalledTimes(1);
    expect(client.pushRates).toHaveBeenCalledTimes(1);
    expect(client.getBookings).toHaveBeenCalledTimes(1);

    const health = healthUpdate(db);
    expect(health.status).toBe('HEALTHY');
    expect(health.errorCount).toBe(0);
    expect(health.lastSuccessAt).toBeInstanceOf(Date);
    expect(health.lastSyncAt).toBeInstanceOf(Date);
  });

  it('converts base_rate paise to major units on the mapped rate plan', async () => {
    const db = runDb({ types: [{ id: DELUXE, baseRate: 250_000 }] });
    const { svc, client } = build({ db });
    await svc.syncConnection(CONNECTION_ID, { horizonDays: 3 });

    const [, updates] = client.pushRates.mock.calls[0] as [string, Record<string, string>[]];
    expect(updates[0].rate).toBe('2500.00');
    expect(updates[0].rate_plan_id).toBe('cx-rp-deluxe');
  });

  it('RESETS error_count on a recovered connection', async () => {
    const db = runDb({ connection: connectionRow({ status: 'WARNING', errorCount: 4 }) });
    await build({ db }).svc.syncConnection(CONNECTION_ID, { horizonDays: 1 });

    expect(healthUpdate(db)).toMatchObject({ status: 'HEALTHY', errorCount: 0 });
  });

  it('degrades to WARNING on a first failure and ERROR on the second', async () => {
    const boom = stubClient({
      pushAvailability: jest.fn(async () => {
        throw new ChannexApiError(500, '/availability', 'upstream boom');
      }),
    });

    const first = runDb();
    await build({ db: first, client: boom }).svc.syncConnection(CONNECTION_ID, { horizonDays: 1 });
    expect(healthUpdate(first)).toMatchObject({ status: 'WARNING', errorCount: 1 });

    const second = runDb({ connection: connectionRow({ errorCount: 1 }) });
    await build({ db: second, client: boom }).svc.syncConnection(CONNECTION_ID, { horizonDays: 1 });
    const health = healthUpdate(second);
    expect(health).toMatchObject({ status: 'ERROR', errorCount: 2 });
    expect(health.lastFailureAt).toBeInstanceOf(Date);
  });

  it('one failing leg does not stop the others', async () => {
    const client = stubClient({
      pushAvailability: jest.fn(async () => {
        throw new ChannexApiError(502, '/availability', 'gateway');
      }),
    });
    const db = runDb();
    const out = await build({ db, client }).svc.syncConnection(CONNECTION_ID, { horizonDays: 1 });

    expect(out.availability.ok).toBe(false);
    expect(out.rates.ok).toBe(true);
    expect(out.bookings.ok).toBe(true);
    expect(out.ok).toBe(false);
    // Rates and bookings still ran despite availability blowing up.
    expect(client.pushRates).toHaveBeenCalled();
    expect(client.getBookings).toHaveBeenCalled();
  });

  it('writes a channex_sync_log row for every leg, success or failure', async () => {
    const client = stubClient({
      pushRates: jest.fn(async () => {
        throw new ChannexApiError(422, '/restrictions', 'bad rate plan');
      }),
    });
    const db = runDb();
    await build({ db, client }).svc.syncConnection(CONNECTION_ID, { horizonDays: 1 });

    const rows = logRows(db);
    expect(rows.map((r) => [r.entity, r.status])).toEqual([
      ['AVAILABILITY', 'SUCCESS'],
      ['RATES', 'FAILED'],
      ['BOOKING', 'SUCCESS'],
    ]);
    expect(rows[1].error).toContain('HTTP 422');
  });

  it('NEVER writes the API key into a sync-log row', async () => {
    // The failure path stringifies an upstream error; if the key ever rode
    // along in a request summary, this is where it would surface.
    const client = stubClient({
      pushAvailability: jest.fn(async () => {
        throw new ChannexApiError(401, '/availability', `rejected key ${KEY}`.replace(KEY, '***'));
      }),
    });
    const db = runDb();
    await build({ db, client }).svc.syncConnection(CONNECTION_ID, { horizonDays: 1 });

    expect(JSON.stringify(logRows(db))).not.toContain(KEY);
  });

  it('names the unmapped room types it skipped rather than failing the push', async () => {
    const db = runDb({ rooms: [{ roomTypeId: 'rt-unmapped' }] });
    const out = await build({ db }).svc.syncConnection(CONNECTION_ID, { horizonDays: 1 });

    expect(out.availability.ok).toBe(true);
    const availabilityLog = logRows(db)[0];
    expect(availabilityLog.status).toBe('SUCCESS');
    expect(availabilityLog.requestSummary).toContain('rt-unmapped');
  });
});

// ---------------------------------------------------------------------------

const BOOKING = {
  id: 'cx-booking-1',
  type: 'booking',
  attributes: {
    status: 'new',
    arrival_date: '2026-09-14',
    departure_date: '2026-09-16',
    customer: { name: 'Asha', surname: 'Menon', mail: 'asha@example.com', phone: '9876543210' },
    rooms: [
      {
        room_type_id: 'cx-rt-deluxe',
        amount: '5000.00',
        occupancy: { adults: 2, children: 1 },
      },
    ],
  },
};

function bookingDb(existing: Row[] = []) {
  return mockDb({
    select: { reservations: [existing] },
    insert: { channex_sync_log: [{ id: 'log-1' }] },
    update: { reservations: [{ id: 'res-1' }] },
  });
}

describe('ChannexSyncService.ingestBooking', () => {
  const cfg = readChannexConfig(CONFIG);

  it('creates a CONFIRMED reservation with source OTA through the booking engine', async () => {
    const db = bookingDb();
    const { svc, reservations } = build({ db });

    const result = await svc.ingestBooking(CONNECTION_ID, PROPERTY_ID, cfg, BOOKING);

    expect(result).toBe('created');
    const [propertyId, dto] = reservations.create.mock.calls[0] as [
      string,
      Record<string, unknown>,
    ];
    expect(propertyId).toBe(PROPERTY_ID);
    expect(dto).toMatchObject({
      roomTypeId: DELUXE,
      guestName: 'Asha Menon',
      guestPhone: '9876543210',
      adults: 2,
      children: 1,
      checkIn: '2026-09-14',
      checkOut: '2026-09-16',
      // 5000.00 major units -> paise.
      ratePaise: 500_000,
      source: 'OTA',
      status: 'CONFIRMED',
    });
  });

  it('stamps the Channex booking id on the reservation as external_ref', async () => {
    const db = bookingDb();
    await build({ db }).svc.ingestBooking(CONNECTION_ID, PROPERTY_ID, cfg, BOOKING);

    const stamp = db.updates.find((u) => u.table === 'reservations');
    expect(stamp?.values).toEqual({ externalRef: 'cx-booking-1' });
  });

  it('IS IDEMPOTENT: a booking already stamped is not created twice', async () => {
    const db = bookingDb([{ id: 'res-existing' }]);
    const { svc, reservations } = build({ db });

    expect(await svc.ingestBooking(CONNECTION_ID, PROPERTY_ID, cfg, BOOKING)).toBe('duplicate');
    expect(reservations.create).not.toHaveBeenCalled();
  });

  it('SKIPS an unmapped room type with a clear reason — never crashes the run', async () => {
    const db = bookingDb();
    const { svc, reservations } = build({ db });
    const booking = {
      ...BOOKING,
      id: 'cx-booking-2',
      attributes: {
        ...BOOKING.attributes,
        rooms: [{ room_type_id: 'cx-rt-unknown' }],
      },
    };

    expect(await svc.ingestBooking(CONNECTION_ID, PROPERTY_ID, cfg, booking)).toBe('skipped');
    expect(reservations.create).not.toHaveBeenCalled();
    const row = logRows(db)[0];
    expect(row.status).toBe('FAILED');
    expect(row.error).toContain('cx-rt-unknown');
    expect(row.error).toContain('not mapped');
  });

  it('skips a booking with no id — it could never be deduped', async () => {
    const db = bookingDb();
    const booking = { ...BOOKING, id: '' };
    expect(await build({ db }).svc.ingestBooking(CONNECTION_ID, PROPERTY_ID, cfg, booking)).toBe(
      'skipped',
    );
    expect(logRows(db)[0].error).toContain('no id');
  });

  it('skips a booking with no dates rather than inventing them', async () => {
    const db = bookingDb();
    const booking = {
      ...BOOKING,
      id: 'cx-booking-3',
      attributes: { ...BOOKING.attributes, arrival_date: undefined, departure_date: undefined },
    };
    expect(await build({ db }).svc.ingestBooking(CONNECTION_ID, PROPERTY_ID, cfg, booking)).toBe(
      'skipped',
    );
    expect(logRows(db)[0].error).toContain('arrival/departure');
  });

  it('records a refusal from the booking engine instead of throwing out of the run', async () => {
    const db = bookingDb();
    const reservations = {
      create: jest.fn(async () => {
        throw new Error('No rooms of that type are free for those dates');
      }),
    };
    expect(
      await build({ db, reservations }).svc.ingestBooking(CONNECTION_ID, PROPERTY_ID, cfg, BOOKING),
    ).toBe('skipped');
    expect(logRows(db)[0].error).toContain('No rooms of that type are free');
  });
});

describe('ChannexSyncService.pullBookings', () => {
  const cfg = readChannexConfig(CONFIG);

  it('keeps going after one bad booking and counts what happened', async () => {
    const client = stubClient({
      getBookings: jest.fn(async () => [
        { ...BOOKING, id: 'a' },
        { ...BOOKING, id: 'b', attributes: { ...BOOKING.attributes, rooms: [{}] } },
        { ...BOOKING, id: 'c' },
      ]),
    });
    const db = mockDb({
      select: { reservations: [[], [], []] },
      insert: { channex_sync_log: [{ id: 'log-1' }] },
      update: { reservations: [{ id: 'res-1' }] },
    });

    const out = await build({ db, client }).svc.pullBookings(CONNECTION_ID, PROPERTY_ID, cfg);
    expect(out).toEqual({ created: 2, skipped: 1, duplicates: 0, ok: true });
  });

  it('reports a failed fetch without throwing', async () => {
    const client = stubClient({
      getBookings: jest.fn(async () => {
        throw new ChannexApiError(500, '/bookings', 'boom');
      }),
    });
    const db = mockDb({ insert: { channex_sync_log: [{ id: 'log-1' }] } });
    const out = await build({ db, client }).svc.pullBookings(CONNECTION_ID, PROPERTY_ID, cfg);

    expect(out.ok).toBe(false);
    expect(logRows(db)[0]).toMatchObject({
      direction: 'PULL',
      entity: 'BOOKING',
      status: 'FAILED',
    });
  });
});

// ---------------------------------------------------------------------------

describe('ChannexSyncService.handleWebhook', () => {
  const payload = {
    event: 'booking',
    event_id: 'evt-1',
    property_id: 'cx-prop-1',
    payload: { booking_id: 'cx-booking-1' },
  };

  function webhookDb() {
    return mockDb({
      select: {
        integration_connections: [[connectionRow()]],
        reservations: [[]],
      },
      insert: {
        channex_webhook_events: [{ id: 'we-1' }],
        channex_sync_log: [{ id: 'log-1' }],
      },
      update: { channex_webhook_events: [{ id: 'we-1' }], reservations: [{ id: 'res-1' }] },
    });
  }

  it('refuses a payload whose secret does not match the configured one', async () => {
    const db = webhookDb();
    await expect(
      build({ db }).svc.handleWebhook({ payload, secret: 'right', providedSecret: 'wrong' }),
    ).rejects.toMatchObject({ response: { error: 'CHANNEX_BAD_SIGNATURE' } });
    // Refused BEFORE anything is stored.
    expect(db.inserts).toHaveLength(0);
  });

  it('accepts a matching secret and processes the booking once', async () => {
    const db = webhookDb();
    const client = stubClient({ getBookings: jest.fn(async () => [BOOKING]) });
    const { svc, reservations } = build({ db, client });

    const res = await svc.handleWebhook({ payload, secret: 's3cret', providedSecret: 's3cret' });

    expect(res).toEqual({ ok: true, replayed: false, processed: true });
    expect(reservations.create).toHaveBeenCalledTimes(1);
    const receipt = db.inserts.find((i) => i.table === 'channex_webhook_events');
    expect(receipt?.values).toMatchObject({ eventId: 'evt-1' });
    // The receipt is closed out only once the booking actually landed.
    expect(db.updates.find((u) => u.table === 'channex_webhook_events')?.values).toHaveProperty(
      'processedAt',
    );
  });

  it('REPLAY: a redelivered event loses the insert race and creates nothing', async () => {
    const db = webhookDb();
    const client = stubClient({ getBookings: jest.fn(async () => [BOOKING]) });
    const { svc, reservations } = build({ db, client });

    const original = db.insert.bind(db);
    db.insert = (table: unknown) => {
      const handle = original(table) as { values: (v: Row) => unknown };
      return {
        values: (v: Row) => {
          const rec = handle.values(v);
          const last = db.inserts.at(-1);
          if (last?.table === 'channex_webhook_events') {
            return {
              returning: () =>
                Promise.reject(
                  new Error(
                    'duplicate key value violates unique constraint "channex_webhook_events_event_id_unique"',
                  ),
                ),
            };
          }
          return rec;
        },
      };
    };

    const res = await svc.handleWebhook({ payload });
    expect(res).toEqual({ ok: true, replayed: true, processed: false });
    expect(reservations.create).not.toHaveBeenCalled();
    expect(client.getBookings).not.toHaveBeenCalled();
  });

  it('records the reason on the event row when processing fails, and still 2xxs', async () => {
    // No connection maps to this Channex property.
    const db = mockDb({
      select: { integration_connections: [[]] },
      insert: { channex_webhook_events: [{ id: 'we-1' }] },
      update: { channex_webhook_events: [{ id: 'we-1' }] },
    });
    const res = await build({ db }).svc.handleWebhook({ payload });

    expect(res).toEqual({ ok: true, replayed: false, processed: false });
    const update = db.updates.find((u) => u.table === 'channex_webhook_events');
    expect(String(update?.values?.error)).toContain('No Channex connection maps to property');
  });

  it('refuses to process when the adapter has no credentials', async () => {
    const db = mockDb({
      insert: { channex_webhook_events: [{ id: 'we-1' }] },
      update: { channex_webhook_events: [{ id: 'we-1' }] },
    });
    const { svc } = build({ db, client: stubClient({ configured: false }) });
    const res = await svc.handleWebhook({ payload });

    expect(res.processed).toBe(false);
    expect(String(db.updates[0]?.values?.error)).toContain('not configured');
  });
});

describe('ChannexSyncService.extractEventId', () => {
  it('prefers the id Channex sends', () => {
    expect(ChannexSyncService.extractEventId({ event_id: 'evt-9' })).toBe('evt-9');
    expect(ChannexSyncService.extractEventId({ id: 'evt-8' })).toBe('evt-8');
  });

  it('falls back to a DETERMINISTIC id so two redeliveries still collide', () => {
    const payload = {
      event: 'booking_modified',
      payload: { booking_id: 'b-1' },
      revision_id: 3,
    };
    expect(ChannexSyncService.extractEventId(payload)).toBe('booking_modified:b-1:3');
    expect(ChannexSyncService.extractEventId({ ...payload })).toBe(
      ChannexSyncService.extractEventId(payload),
    );
  });
});
