import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, ilike, inArray, isNull, sql, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  amenities,
  rooms,
  roomTypeAmenities,
  roomTypeBeds,
  roomTypePhotos,
  roomTypes,
  type Amenity,
  type BedType,
  type RoomType,
  type RoomTypeBed,
  type RoomTypePhoto,
  type RoomTypeStatus,
  type SizeUnit,
} from '../../database/schema';
import { StorageService } from '../storage/storage.service';
import { AmenitiesService } from './amenities.service';
import { RoomTypeBedDto, RoomTypeFilterDto, RoomTypeInputDto, UpdateRoomTypeDto } from './dto';
import { RoomErrors } from './room-errors';

const MAX_LIMIT = 100;

/** Photo URLs are short-lived: long enough to render a page, not to be shared. */
export const ROOM_TYPE_PHOTO_URL_TTL_SECONDS = 3600;

/** Exact, and the same constant the migration comment documents. */
const SQFT_PER_SQM = 10.7639;

/**
 * `size_sqft` is the CANONICAL size column and every existing reader uses it.
 * `sizeValue`/`sizeUnit` record what the hotel actually typed, so a property
 * that thinks in square metres never has to convert — and this function is the
 * single place the two are reconciled, on every write.
 */
export function sqftFrom(value: number, unit: SizeUnit): number {
  return unit === 'SQM' ? Math.round(value * SQFT_PER_SQM) : value;
}

/** The occupancy/rate numbers as they will exist AFTER a create or update. */
interface OccupancyShape {
  maxOccupancy: number;
  baseOccupancy: number;
  maxAdults: number;
  maxChildren: number;
  maxInfants: number;
  baseRate: number;
  extraBedPricePaise: number | null;
  extraBedCapacity: number | null;
}

/**
 * Validated against the MERGED row, never against the patch alone: lowering
 * `maxOccupancy` on its own must still be checked against the `baseOccupancy`
 * already stored, or a two-step edit walks straight past every rule.
 */
export function assertOccupancy(v: OccupancyShape): void {
  if (v.baseOccupancy < 1) {
    throw RoomErrors.occupancyInvalid('Base occupancy must be at least 1 guest');
  }
  if (v.maxAdults < 1) {
    throw RoomErrors.occupancyInvalid('A room type must allow at least 1 adult');
  }
  for (const [label, n] of [
    ['Maximum children', v.maxChildren],
    ['Maximum infants', v.maxInfants],
    ['Extra bed capacity', v.extraBedCapacity ?? 0],
  ] as const) {
    if (n < 0) throw RoomErrors.occupancyInvalid(`${label} cannot be negative`);
  }
  if (v.maxOccupancy < v.baseOccupancy) {
    throw RoomErrors.occupancyInvalid(
      `Maximum occupancy (${v.maxOccupancy}) cannot be below the base occupancy (${v.baseOccupancy})`,
    );
  }
  // A room that claims to sleep 2 cannot also claim to admit 4 adults.
  if (v.maxOccupancy < v.maxAdults) {
    throw RoomErrors.occupancyInvalid(
      `Maximum occupancy (${v.maxOccupancy}) cannot be below the maximum adults (${v.maxAdults})`,
    );
  }
  for (const [label, n] of [
    ['Base rate', v.baseRate],
    ['Extra bed price', v.extraBedPricePaise ?? 0],
  ] as const) {
    if (n < 0) throw RoomErrors.rateInvalid(`${label} cannot be negative`);
  }
}

/**
 * Room types — the COMMERCIAL unit of a hotel (a "Deluxe Sea View"), as opposed
 * to `rooms`, the physical unit reception hands a key to. Rate, occupancy and
 * the shared amenity list live here so they are entered once, not forty times.
 *
 * Every method is scoped to ONE property. A row at another property is
 * indistinguishable from a row that does not exist — both 404 — exactly as the
 * staff team endpoints already behave. A 403 would confirm the row is real.
 */
@Injectable()
export class RoomTypesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly amenityCatalogue: AmenitiesService,
    private readonly storage: StorageService,
  ) {}

  static conditions(propertyId: string, params: RoomTypeFilterDto): SQL[] {
    const conds: SQL[] = [eq(roomTypes.propertyId, propertyId), isNull(roomTypes.deletedAt)];
    if (params.status) conds.push(eq(roomTypes.status, params.status as RoomTypeStatus));
    if (params.q) conds.push(ilike(roomTypes.name, `%${params.q}%`));
    return conds;
  }

  static bedDto(b: RoomTypeBed) {
    return { id: b.id, bedType: b.bedType, quantity: b.quantity, sortOrder: b.sortOrder };
  }

  static toDto(
    t: RoomType,
    attached: readonly Amenity[] = [],
    roomCount?: number,
    extras: {
      beds?: ReturnType<typeof RoomTypesService.bedDto>[];
      photos?: unknown[];
      primaryPhotoUrl?: string | null;
    } = {},
  ) {
    return {
      id: t.id,
      propertyId: t.propertyId,
      name: t.name,
      code: t.code,
      description: t.description,
      floorLabel: t.floorLabel,
      unitKind: t.unitKind,
      unitRoomCount: t.unitRoomCount,
      privatePool: t.privatePool,
      smokingPolicy: t.smokingPolicy,
      accessible: t.accessible,
      /** The PRIMARY bed. `beds` below is the full arrangement. */
      bedType: t.bedType,
      bedCount: t.bedCount,
      maxOccupancy: t.maxOccupancy,
      baseOccupancy: t.baseOccupancy,
      maxAdults: t.maxAdults,
      maxChildren: t.maxChildren,
      maxInfants: t.maxInfants,
      extraBedAvailable: t.extraBedAvailable,
      extraBedType: t.extraBedType,
      extraBedCapacity: t.extraBedCapacity,
      extraBedPricePaise: t.extraBedPricePaise,
      airConditioned: t.airConditioned,
      baseRate: t.baseRate,
      currency: t.currency,
      dynamicPricingEnabled: t.dynamicPricingEnabled,
      pricesIncludeTax: t.pricesIncludeTax,
      /** Canonical square feet, plus the value/unit the hotel actually typed. */
      sizeSqft: t.sizeSqft,
      sizeValue: t.sizeValue,
      sizeUnit: t.sizeUnit,
      status: t.status,
      amenities: [...attached]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((a) => ({ id: a.id, key: a.key, name: a.name, icon: a.icon })),
      ...(roomCount === undefined ? {} : { roomCount, unitCount: roomCount }),
      ...(extras.beds === undefined ? {} : { beds: extras.beds }),
      ...(extras.photos === undefined ? {} : { photos: extras.photos }),
      ...(extras.primaryPhotoUrl === undefined ? {} : { primaryPhotoUrl: extras.primaryPhotoUrl }),
      createdAt: t.createdAt,
      updatedAt: t.updatedAt,
    };
  }

  /** One query for a whole page's amenities, not one per row. */
  async amenitiesByType(typeIds: readonly string[]): Promise<Map<string, Amenity[]>> {
    const out = new Map<string, Amenity[]>();
    if (typeIds.length === 0) return out;
    const rows = await this.db
      .select({ roomTypeId: roomTypeAmenities.roomTypeId, amenity: amenities })
      .from(roomTypeAmenities)
      .innerJoin(amenities, eq(roomTypeAmenities.amenityId, amenities.id))
      .where(inArray(roomTypeAmenities.roomTypeId, [...typeIds]));
    for (const r of rows) {
      const list = out.get(r.roomTypeId);
      if (list) list.push(r.amenity);
      else out.set(r.roomTypeId, [r.amenity]);
    }
    return out;
  }

  /** One grouped query for the whole page — never one per row. */
  private async roomCounts(typeIds: readonly string[]): Promise<Map<string, number>> {
    const out = new Map<string, number>();
    if (typeIds.length === 0) return out;
    const rows = await this.db
      .select({ roomTypeId: rooms.roomTypeId, n: sql<number>`count(*)::int` })
      .from(rooms)
      .where(and(inArray(rooms.roomTypeId, [...typeIds]), isNull(rooms.deletedAt)))
      .groupBy(rooms.roomTypeId);
    for (const r of rows) out.set(r.roomTypeId, r.n);
    return out;
  }

  private async bedsByType(typeIds: readonly string[]): Promise<Map<string, RoomTypeBed[]>> {
    const out = new Map<string, RoomTypeBed[]>();
    if (typeIds.length === 0) return out;
    const rows = await this.db
      .select()
      .from(roomTypeBeds)
      .where(inArray(roomTypeBeds.roomTypeId, [...typeIds]))
      .orderBy(asc(roomTypeBeds.sortOrder), asc(roomTypeBeds.createdAt));
    for (const r of rows) {
      const list = out.get(r.roomTypeId);
      if (list) list.push(r);
      else out.set(r.roomTypeId, [r]);
    }
    return out;
  }

  /**
   * ONE query for the whole page's thumbnails, filtered to primaries in SQL —
   * the list screen shows a thumbnail per row and must not fan out into a query
   * per room type.
   */
  private async primaryPhotoUrls(typeIds: readonly string[]): Promise<Map<string, string>> {
    const out = new Map<string, string>();
    if (typeIds.length === 0) return out;
    const rows = await this.db
      .select()
      .from(roomTypePhotos)
      .where(
        and(inArray(roomTypePhotos.roomTypeId, [...typeIds]), eq(roomTypePhotos.isPrimary, true)),
      );
    await Promise.all(
      rows.map(async (r) => {
        out.set(
          r.roomTypeId,
          await this.storage.getSignedUrl(r.storageKey, ROOM_TYPE_PHOTO_URL_TTL_SECONDS),
        );
      }),
    );
    return out;
  }

  private async photoDtos(roomTypeId: string) {
    const rows: RoomTypePhoto[] = await this.db
      .select()
      .from(roomTypePhotos)
      .where(eq(roomTypePhotos.roomTypeId, roomTypeId))
      .orderBy(asc(roomTypePhotos.sortOrder), asc(roomTypePhotos.createdAt));
    return Promise.all(
      rows.map(async (r) => ({
        id: r.id,
        url: await this.storage.getSignedUrl(r.storageKey, ROOM_TYPE_PHOTO_URL_TTL_SECONDS),
        category: r.category,
        isPrimary: r.isPrimary,
        sortOrder: r.sortOrder,
        contentType: r.contentType,
        sizeBytes: r.sizeBytes,
        createdAt: r.createdAt,
        expiresInSeconds: ROOM_TYPE_PHOTO_URL_TTL_SECONDS,
      })),
    );
  }

  async list(propertyId: string, params: RoomTypeFilterDto = {}) {
    const limit = Math.min(params.limit ?? 50, MAX_LIMIT);
    const offset = params.offset ?? 0;
    const where = and(...RoomTypesService.conditions(propertyId, params));

    const rows = await this.db
      .select()
      .from(roomTypes)
      .where(where)
      .orderBy(asc(roomTypes.name))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(roomTypes)
      .where(where);

    const ids = rows.map((r) => r.id);
    const attached = await this.amenitiesByType(ids);
    const counts = await this.roomCounts(ids);
    const covers = await this.primaryPhotoUrls(ids);

    return {
      items: rows.map((r) =>
        RoomTypesService.toDto(r, attached.get(r.id) ?? [], counts.get(r.id) ?? 0, {
          primaryPhotoUrl: covers.get(r.id) ?? null,
        }),
      ),
      total: count,
      limit,
      offset,
    };
  }

  async get(propertyId: string, id: string) {
    const row = await this.requireRoomType(propertyId, id);
    const attached = await this.amenitiesByType([row.id]);
    const counts = await this.roomCounts([row.id]);
    const beds = await this.bedsByType([row.id]);
    const photos = await this.photoDtos(row.id);
    return RoomTypesService.toDto(row, attached.get(row.id) ?? [], counts.get(row.id) ?? 0, {
      beds: (beds.get(row.id) ?? []).map(RoomTypesService.bedDto),
      photos,
      primaryPhotoUrl: photos.find((p) => p.isPrimary)?.url ?? null,
    });
  }

  /**
   * Size, resolved to BOTH shapes. `sizeSqft` stays canonical; a caller sending
   * only the legacy `sizeSqft` gets `sizeValue`/`sizeUnit` filled in for it, and
   * a caller sending `sizeValue` in SQM gets the converted sqft, so the two can
   * never disagree.
   */
  private static resolveSize(
    dto: { sizeValue?: number; sizeUnit?: SizeUnit; sizeSqft?: number },
    current: { sizeValue: number | null; sizeUnit: SizeUnit; sizeSqft: number | null } = {
      sizeValue: null,
      sizeUnit: 'SQFT',
      sizeSqft: null,
    },
  ): { sizeValue: number | null; sizeUnit: SizeUnit; sizeSqft: number | null } | null {
    if (dto.sizeValue === undefined && dto.sizeUnit === undefined && dto.sizeSqft === undefined) {
      return null;
    }
    if (dto.sizeValue !== undefined || dto.sizeUnit !== undefined) {
      const unit = dto.sizeUnit ?? current.sizeUnit ?? 'SQFT';
      const value = dto.sizeValue ?? current.sizeValue;
      if (value === null || value === undefined) {
        return { sizeValue: null, sizeUnit: unit, sizeSqft: null };
      }
      return { sizeValue: value, sizeUnit: unit, sizeSqft: sqftFrom(value, unit) };
    }
    // Legacy-only caller: sqft is both the stored value and the typed one.
    return { sizeValue: dto.sizeSqft ?? null, sizeUnit: 'SQFT', sizeSqft: dto.sizeSqft ?? null };
  }

  /** The denormalised primary pair, taken from the FIRST bed row. */
  private static primaryBed(beds: RoomTypeBedDto[]): { bedType: BedType; bedCount: number } {
    const first = beds[0];
    return { bedType: first.bedType, bedCount: first.quantity ?? 1 };
  }

  private static bedRows(roomTypeId: string, beds: RoomTypeBedDto[]) {
    return beds.map((b, i) => ({
      roomTypeId,
      bedType: b.bedType,
      quantity: b.quantity ?? 1,
      sortOrder: i,
    }));
  }

  async create(propertyId: string, dto: RoomTypeInputDto) {
    // Validate the amenity ids BEFORE opening the transaction, so a bad id is a
    // clean 400 rather than a rolled-back insert.
    const attach = await this.amenityCatalogue.resolveForScope(dto.amenityIds ?? [], 'ROOM');

    const baseOccupancy = dto.baseOccupancy ?? Math.min(2, dto.maxOccupancy);
    assertOccupancy({
      maxOccupancy: dto.maxOccupancy,
      baseOccupancy,
      maxAdults: dto.maxAdults,
      maxChildren: dto.maxChildren,
      maxInfants: dto.maxInfants ?? 0,
      baseRate: dto.baseRate,
      extraBedPricePaise: dto.extraBedPricePaise ?? null,
      extraBedCapacity: dto.extraBedCapacity ?? null,
    });

    const size = RoomTypesService.resolveSize(dto);
    // The first bed row IS the primary bed — the denormalised pair follows it.
    const primary = dto.beds?.length ? RoomTypesService.primaryBed(dto.beds) : null;

    let bedRows: RoomTypeBed[] = [];
    const row = await this.db.transaction(async (tx) => {
      let created: RoomType;
      try {
        [created] = await tx
          .insert(roomTypes)
          .values({
            propertyId,
            name: dto.name,
            code: dto.code ?? null,
            description: dto.description ?? null,
            floorLabel: dto.floorLabel ?? null,
            unitKind: dto.unitKind ?? 'ROOM',
            // A plain room is always a 1-room unit, whatever the client sent.
            unitRoomCount: (dto.unitKind ?? 'ROOM') === 'ROOM' ? 1 : (dto.unitRoomCount ?? 1),
            privatePool: dto.privatePool ?? false,
            smokingPolicy: dto.smokingPolicy ?? 'NON_SMOKING',
            accessible: dto.accessible ?? false,
            bedType: primary?.bedType ?? dto.bedType,
            bedCount: primary?.bedCount ?? dto.bedCount,
            maxOccupancy: dto.maxOccupancy,
            baseOccupancy,
            maxAdults: dto.maxAdults,
            maxChildren: dto.maxChildren,
            maxInfants: dto.maxInfants ?? 0,
            extraBedAvailable: dto.extraBedAvailable ?? false,
            extraBedType: dto.extraBedType ?? null,
            extraBedCapacity: dto.extraBedCapacity ?? null,
            extraBedPricePaise: dto.extraBedPricePaise ?? null,
            airConditioned: dto.airConditioned,
            baseRate: dto.baseRate,
            currency: dto.currency ?? 'INR',
            dynamicPricingEnabled: dto.dynamicPricingEnabled ?? false,
            pricesIncludeTax: dto.pricesIncludeTax ?? false,
            sizeSqft: size?.sizeSqft ?? null,
            sizeValue: size?.sizeValue ?? null,
            sizeUnit: size?.sizeUnit ?? 'SQFT',
          })
          .returning();
      } catch (err) {
        throw RoomTypesService.asUniqueConflict(err);
      }
      if (dto.beds?.length) {
        bedRows = await tx
          .insert(roomTypeBeds)
          .values(RoomTypesService.bedRows(created.id, dto.beds))
          .returning();
      }
      if (attach.length) {
        await tx
          .insert(roomTypeAmenities)
          .values(attach.map((a) => ({ roomTypeId: created.id, amenityId: a.id })));
      }
      return created;
    });

    return RoomTypesService.toDto(row, attach, 0, {
      beds: bedRows.map(RoomTypesService.bedDto),
      photos: [],
      primaryPhotoUrl: null,
    });
  }

  async update(propertyId: string, id: string, dto: UpdateRoomTypeDto) {
    const before = await this.requireRoomType(propertyId, id);

    const patch: Partial<typeof roomTypes.$inferInsert> = { updatedAt: new Date() };
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.code !== undefined) patch.code = dto.code;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.floorLabel !== undefined) patch.floorLabel = dto.floorLabel;
    if (dto.unitKind !== undefined) patch.unitKind = dto.unitKind;
    if (dto.unitRoomCount !== undefined) patch.unitRoomCount = dto.unitRoomCount;
    if (dto.privatePool !== undefined) patch.privatePool = dto.privatePool;
    if (dto.smokingPolicy !== undefined) patch.smokingPolicy = dto.smokingPolicy;
    if (dto.accessible !== undefined) patch.accessible = dto.accessible;
    if (dto.bedType !== undefined) patch.bedType = dto.bedType;
    if (dto.bedCount !== undefined) patch.bedCount = dto.bedCount;
    if (dto.maxOccupancy !== undefined) patch.maxOccupancy = dto.maxOccupancy;
    if (dto.baseOccupancy !== undefined) patch.baseOccupancy = dto.baseOccupancy;
    if (dto.maxAdults !== undefined) patch.maxAdults = dto.maxAdults;
    if (dto.maxChildren !== undefined) patch.maxChildren = dto.maxChildren;
    if (dto.maxInfants !== undefined) patch.maxInfants = dto.maxInfants;
    if (dto.extraBedAvailable !== undefined) patch.extraBedAvailable = dto.extraBedAvailable;
    if (dto.extraBedType !== undefined) patch.extraBedType = dto.extraBedType;
    if (dto.extraBedCapacity !== undefined) patch.extraBedCapacity = dto.extraBedCapacity;
    if (dto.extraBedPricePaise !== undefined) patch.extraBedPricePaise = dto.extraBedPricePaise;
    if (dto.airConditioned !== undefined) patch.airConditioned = dto.airConditioned;
    if (dto.baseRate !== undefined) patch.baseRate = dto.baseRate;
    if (dto.currency !== undefined) patch.currency = dto.currency;
    if (dto.dynamicPricingEnabled !== undefined) {
      patch.dynamicPricingEnabled = dto.dynamicPricingEnabled;
    }
    if (dto.pricesIncludeTax !== undefined) patch.pricesIncludeTax = dto.pricesIncludeTax;
    if (dto.status !== undefined) patch.status = dto.status;

    // Size: one resolution for all three inputs, so `size_sqft` can never drift
    // away from the value/unit the hotel typed.
    const size = RoomTypesService.resolveSize(dto, {
      sizeValue: before.sizeValue,
      sizeUnit: before.sizeUnit,
      sizeSqft: before.sizeSqft,
    });
    if (size) {
      patch.sizeSqft = size.sizeSqft;
      patch.sizeValue = size.sizeValue;
      patch.sizeUnit = size.sizeUnit;
    }

    // A ROOM-kind type is always a 1-room unit — converting a villa back to a
    // plain room must not leave a stale multi-room count behind. Only touch the
    // count when the caller touched either field, so the nothing-to-update
    // guard below still works.
    if (
      (dto.unitKind !== undefined || dto.unitRoomCount !== undefined) &&
      (dto.unitKind ?? before.unitKind) === 'ROOM'
    ) {
      patch.unitRoomCount = 1;
    }

    // The first bed row wins over any bedType/bedCount also sent, so the pair
    // and the list can never contradict each other.
    const replacingBeds = dto.beds !== undefined;
    if (replacingBeds && dto.beds?.length) {
      const primary = RoomTypesService.primaryBed(dto.beds);
      patch.bedType = primary.bedType;
      patch.bedCount = primary.bedCount;
    }

    // Checked against the MERGED row, not the patch: lowering maxOccupancy on
    // its own must still be weighed against the stored baseOccupancy.
    assertOccupancy({
      maxOccupancy: dto.maxOccupancy ?? before.maxOccupancy,
      baseOccupancy: dto.baseOccupancy ?? before.baseOccupancy,
      maxAdults: dto.maxAdults ?? before.maxAdults,
      maxChildren: dto.maxChildren ?? before.maxChildren,
      maxInfants: dto.maxInfants ?? before.maxInfants,
      baseRate: dto.baseRate ?? before.baseRate,
      extraBedPricePaise: dto.extraBedPricePaise ?? before.extraBedPricePaise,
      extraBedCapacity: dto.extraBedCapacity ?? before.extraBedCapacity,
    });

    const replacingAmenities = dto.amenityIds !== undefined;
    if (Object.keys(patch).length === 1 && !replacingAmenities && !replacingBeds) {
      throw RoomErrors.nothingToUpdate();
    }
    const attach = replacingAmenities
      ? await this.amenityCatalogue.resolveForScope(dto.amenityIds ?? [], 'ROOM')
      : [];

    const row = await this.db.transaction(async (tx) => {
      let updated: RoomType;
      try {
        [updated] = await tx.update(roomTypes).set(patch).where(eq(roomTypes.id, id)).returning();
      } catch (err) {
        throw RoomTypesService.asUniqueConflict(err);
      }
      if (replacingBeds) {
        // Replace-the-set, in ONE transaction: a failure can never leave a type
        // with half an arrangement.
        await tx.delete(roomTypeBeds).where(eq(roomTypeBeds.roomTypeId, id));
        if (dto.beds?.length) {
          await tx.insert(roomTypeBeds).values(RoomTypesService.bedRows(id, dto.beds));
        }
      }
      if (replacingAmenities) {
        // PUT semantics on the set: clear then re-attach, in one transaction so
        // a failure can never leave a type with half its amenities.
        await tx.delete(roomTypeAmenities).where(eq(roomTypeAmenities.roomTypeId, id));
        if (attach.length) {
          await tx
            .insert(roomTypeAmenities)
            .values(attach.map((a) => ({ roomTypeId: id, amenityId: a.id })));
        }
      }
      return updated;
    });

    const finalAmenities = replacingAmenities
      ? attach
      : ((await this.amenitiesByType([id])).get(id) ?? []);
    const beds = (await this.bedsByType([id])).get(id) ?? [];
    return {
      before: RoomTypesService.toDto(before),
      after: RoomTypesService.toDto(row, finalAmenities, undefined, {
        beds: beds.map(RoomTypesService.bedDto),
      }),
    };
  }

  /**
   * Two partial uniques hang off this table — name and code — and a bare 23505
   * says which constraint fired only in its detail text. Reading the constraint
   * name is what keeps the two conflicts distinguishable to a client.
   */
  private static asUniqueConflict(err: unknown): unknown {
    const e = err as { code?: string; constraint?: string; constraint_name?: string };
    if (e?.code !== '23505') return err;
    const name = e.constraint ?? e.constraint_name ?? '';
    return name.includes('code') ? RoomErrors.roomTypeCodeTaken() : RoomErrors.roomTypeNameTaken();
  }

  /**
   * Soft delete. Refused while rooms still reference the type: the FK is ON
   * DELETE RESTRICT precisely so a type cannot take live rooms with it, and a
   * counted refusal is a better answer than a raw constraint violation.
   */
  async remove(propertyId: string, id: string) {
    const before = await this.requireRoomType(propertyId, id);
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(rooms)
      .where(and(eq(rooms.roomTypeId, id), isNull(rooms.deletedAt)));
    if (count > 0) throw RoomErrors.roomTypeInUse(count);

    const now = new Date();
    await this.db
      .update(roomTypes)
      .set({ deletedAt: now, updatedAt: now, status: 'ARCHIVED' })
      .where(eq(roomTypes.id, id));
    return { id, deleted: true, before: RoomTypesService.toDto(before) };
  }

  /**
   * The single choke point for resolving a room type. Always by
   * (id, propertyId, deletedAt IS NULL) — never by id alone.
   */
  async requireRoomType(propertyId: string, id: string): Promise<RoomType> {
    const [row] = await this.db
      .select()
      .from(roomTypes)
      .where(
        and(
          eq(roomTypes.id, id),
          eq(roomTypes.propertyId, propertyId),
          isNull(roomTypes.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw RoomErrors.roomTypeNotFound();
    return row;
  }
}
