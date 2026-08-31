/**
 * Typed accessors over `integration_connections.config`, which is a bare
 * `jsonb` column shared by every provider.
 *
 * The column stays untyped in the schema on purpose — each provider needs a
 * different shape — so the type safety has to live here, in ONE place, and be
 * defensive: the row may have been written by a hand-run SQL statement, an
 * older build, or another provider entirely. Every reader below tolerates
 * garbage and returns an empty mapping rather than throwing halfway through a
 * sync run.
 */

export interface ChannexConnectionConfig {
  /** The property id ON CHANNEX. Nothing can be pushed or pulled without it. */
  channexPropertyId?: string;
  /** taveloRoomTypeId -> channexRoomTypeId */
  roomTypeMap: Record<string, string>;
  /** taveloRoomTypeId -> channexRatePlanId */
  ratePlanMap: Record<string, string>;
}

function stringMap(value: unknown): Record<string, string> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    if (typeof v === 'string' && v.length > 0) out[k] = v;
  }
  return out;
}

export function readChannexConfig(config: unknown): ChannexConnectionConfig {
  const raw = (config && typeof config === 'object' ? config : {}) as Record<string, unknown>;
  const propertyId = raw.channexPropertyId;
  return {
    channexPropertyId: typeof propertyId === 'string' && propertyId ? propertyId : undefined,
    roomTypeMap: stringMap(raw.roomTypeMap),
    ratePlanMap: stringMap(raw.ratePlanMap),
  };
}

/**
 * Merges ONE room type's channel mapping into an existing raw config value and
 * returns the whole jsonb to store back.
 *
 * Read-modify-write, and deliberately over the RAW object rather than over the
 * parsed one: a connection row may carry keys this file knows nothing about
 * (another provider's, a newer build's), and replacing the column with only the
 * Channex-shaped subset would silently drop them. `undefined` for either id
 * removes that room type's key instead of writing an empty string.
 */
export function writeChannexRoomTypeMapping(
  config: unknown,
  taveloRoomTypeId: string,
  mapping: { channelRoomTypeId?: string; channelRatePlanId?: string },
): Record<string, unknown> {
  const raw = {
    ...((config && typeof config === 'object' ? config : {}) as Record<string, unknown>),
  };
  const current = readChannexConfig(config);

  const roomTypeMap = { ...current.roomTypeMap };
  const ratePlanMap = { ...current.ratePlanMap };

  if (mapping.channelRoomTypeId) roomTypeMap[taveloRoomTypeId] = mapping.channelRoomTypeId;
  else delete roomTypeMap[taveloRoomTypeId];

  if (mapping.channelRatePlanId) ratePlanMap[taveloRoomTypeId] = mapping.channelRatePlanId;
  else delete ratePlanMap[taveloRoomTypeId];

  raw.roomTypeMap = roomTypeMap;
  raw.ratePlanMap = ratePlanMap;
  return raw;
}

/** Channex room type id -> Tavelo room type id. Built by inverting the map. */
export function invertRoomTypeMap(cfg: ChannexConnectionConfig): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [taveloId, channexId] of Object.entries(cfg.roomTypeMap)) out[channexId] = taveloId;
  return out;
}
