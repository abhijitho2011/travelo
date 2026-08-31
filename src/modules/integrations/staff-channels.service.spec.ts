import { mockDb, sqlText, type MockDb } from '../owner-auth/testing/db.mock';
import { StaffChannelsService } from './staff-channels.service';
import type { Database } from '../../database/database.module';

const MY_PROPERTY = 'prop-mine';
const ROOM_TYPE = 'rt-1';
const CONNECTION = 'conn-1';

function svc(db: MockDb) {
  return new StaffChannelsService(db as unknown as Database);
}

/** A connection already carrying ANOTHER room type's mapping plus a foreign key. */
const CONNECTION_ROW = {
  id: CONNECTION,
  propertyId: MY_PROPERTY,
  provider: 'channex',
  status: 'HEALTHY',
  lastSyncAt: null,
  lastSuccessAt: null,
  lastFailureAt: null,
  errorCount: 0,
  detail: null,
  config: {
    channexPropertyId: 'chx-prop',
    roomTypeMap: { 'rt-other': 'chx-other', [ROOM_TYPE]: 'chx-old' },
    ratePlanMap: { 'rt-other': 'rp-other', [ROOM_TYPE]: 'rp-old' },
    someOtherProviderKey: { keep: 'me' },
  },
};

describe('StaffChannelsService.list', () => {
  it('reports a healthy Channex connection with a property id as connected', async () => {
    const db = mockDb({ select: { integration_connections: [[CONNECTION_ROW]] } });
    const { items } = await svc(db).list(MY_PROPERTY);

    expect(items).toEqual([
      expect.objectContaining({
        id: CONNECTION,
        provider: 'channex',
        status: 'HEALTHY',
        connected: true,
        channexPropertyId: 'chx-prop',
        errorCount: 0,
      }),
    ]);
    expect(sqlText(db.wheresFor('integration_connections')[0])).toContain(MY_PROPERTY);
  });

  it('is not connected when the health is ERROR, or when no channex property id is set', async () => {
    const db = mockDb({
      select: {
        integration_connections: [
          [
            { ...CONNECTION_ROW, status: 'ERROR' },
            { ...CONNECTION_ROW, id: 'conn-2', config: { roomTypeMap: {}, ratePlanMap: {} } },
            { ...CONNECTION_ROW, id: 'conn-3', status: 'WARNING' },
          ],
        ],
      },
    });
    const { items } = await svc(db).list(MY_PROPERTY);

    expect(items.map((i) => i.connected)).toEqual([false, false, true]);
    expect(items[1].channexPropertyId).toBeNull();
  });
});

describe('StaffChannelsService.mappingsForRoomType', () => {
  it('returns one row per connection, mapped or not', async () => {
    const db = mockDb({
      select: {
        room_types: [[{ id: ROOM_TYPE }]],
        integration_connections: [
          [
            CONNECTION_ROW,
            { ...CONNECTION_ROW, id: 'conn-2', config: { channexPropertyId: 'p2' } },
          ],
        ],
      },
    });
    const { items } = await svc(db).mappingsForRoomType(MY_PROPERTY, ROOM_TYPE);

    expect(items).toEqual([
      expect.objectContaining({
        connectionId: CONNECTION,
        mapped: true,
        channelRoomTypeId: 'chx-old',
        channelRatePlanId: 'rp-old',
      }),
      expect.objectContaining({
        connectionId: 'conn-2',
        mapped: false,
        channelRoomTypeId: null,
        channelRatePlanId: null,
      }),
    ]);
  });

  it('404s for a room type belonging to another property', async () => {
    const db = mockDb({ select: { room_types: [[]] } });
    await expect(svc(db).mappingsForRoomType(MY_PROPERTY, 'rt-theirs')).rejects.toMatchObject({
      response: { error: 'ROOM_TYPE_NOT_FOUND' },
      status: 404,
    });
  });
});

describe('StaffChannelsService.mapRoomType', () => {
  it('merges into the existing config rather than replacing it', async () => {
    const db = mockDb({
      select: {
        room_types: [[{ id: ROOM_TYPE }]],
        integration_connections: [[CONNECTION_ROW]],
      },
      update: {
        integration_connections: [
          {
            ...CONNECTION_ROW,
            config: {
              ...CONNECTION_ROW.config,
              roomTypeMap: { 'rt-other': 'chx-other', [ROOM_TYPE]: 'chx-new' },
              ratePlanMap: { 'rt-other': 'rp-other', [ROOM_TYPE]: 'rp-new' },
            },
          },
        ],
      },
    });

    const dto = await svc(db).mapRoomType(MY_PROPERTY, ROOM_TYPE, CONNECTION, {
      channelRoomTypeId: 'chx-new',
      channelRatePlanId: 'rp-new',
    });

    const written = db.updates[0].values!.config as Record<string, unknown>;
    expect(written.roomTypeMap).toEqual({ 'rt-other': 'chx-other', [ROOM_TYPE]: 'chx-new' });
    expect(written.ratePlanMap).toEqual({ 'rt-other': 'rp-other', [ROOM_TYPE]: 'rp-new' });
    // Neither another provider's keys nor the channex property id are clobbered.
    expect(written.someOtherProviderKey).toEqual({ keep: 'me' });
    expect(written.channexPropertyId).toBe('chx-prop');

    expect(dto).toMatchObject({
      connectionId: CONNECTION,
      mapped: true,
      channelRoomTypeId: 'chx-new',
      channelRatePlanId: 'rp-new',
      connected: true,
    });
  });

  it('rejects an empty channel room type id before touching the database', async () => {
    const db = mockDb();
    await expect(
      svc(db).mapRoomType(MY_PROPERTY, ROOM_TYPE, CONNECTION, { channelRoomTypeId: '   ' }),
    ).rejects.toMatchObject({ response: { error: 'CHANNEL_MAPPING_INVALID' }, status: 400 });
    expect(db.updates).toHaveLength(0);
    expect(db.selects).toHaveLength(0);
  });

  it('404s for a connection belonging to another property', async () => {
    const db = mockDb({
      select: { room_types: [[{ id: ROOM_TYPE }]], integration_connections: [[]] },
    });
    await expect(
      svc(db).mapRoomType(MY_PROPERTY, ROOM_TYPE, 'conn-theirs', { channelRoomTypeId: 'x' }),
    ).rejects.toMatchObject({
      response: { error: 'CHANNEL_CONNECTION_NOT_FOUND' },
      status: 404,
    });
    expect(db.updates).toHaveLength(0);
  });
});

describe('StaffChannelsService.unmapRoomType', () => {
  it('removes only this room type from both maps', async () => {
    const db = mockDb({
      select: {
        room_types: [[{ id: ROOM_TYPE }]],
        integration_connections: [[CONNECTION_ROW]],
      },
      update: {
        integration_connections: [
          {
            ...CONNECTION_ROW,
            config: {
              ...CONNECTION_ROW.config,
              roomTypeMap: { 'rt-other': 'chx-other' },
              ratePlanMap: { 'rt-other': 'rp-other' },
            },
          },
        ],
      },
    });

    const dto = await svc(db).unmapRoomType(MY_PROPERTY, ROOM_TYPE, CONNECTION);

    const written = db.updates[0].values!.config as Record<string, unknown>;
    expect(written.roomTypeMap).toEqual({ 'rt-other': 'chx-other' });
    expect(written.ratePlanMap).toEqual({ 'rt-other': 'rp-other' });
    expect(written.channexPropertyId).toBe('chx-prop');

    expect(dto).toMatchObject({
      mapped: false,
      channelRoomTypeId: null,
      channelRatePlanId: null,
    });
    // Scoped by BOTH id and property, so a foreign row cannot be written.
    expect(sqlText(db.updates[0].where[0])).toContain(MY_PROPERTY);
  });
});
