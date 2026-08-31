import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, ilike, inArray, isNull, sql, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  amenities,
  rooms,
  roomTypeAmenities,
  roomTypes,
  type Amenity,
  type RoomType,
  type RoomTypeStatus,
} from '../../database/schema';
import { AmenitiesService } from './amenities.service';
import { RoomTypeFilterDto, RoomTypeInputDto, UpdateRoomTypeDto } from './dto';
import { RoomErrors } from './room-errors';

const MAX_LIMIT = 100;

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
  ) {}

  static conditions(propertyId: string, params: RoomTypeFilterDto): SQL[] {
    const conds: SQL[] = [eq(roomTypes.propertyId, propertyId), isNull(roomTypes.deletedAt)];
    if (params.status) conds.push(eq(roomTypes.status, params.status as RoomTypeStatus));
    if (params.q) conds.push(ilike(roomTypes.name, `%${params.q}%`));
    return conds;
  }

  static toDto(t: RoomType, attached: readonly Amenity[] = [], roomCount?: number) {
    return {
      id: t.id,
      propertyId: t.propertyId,
      name: t.name,
      description: t.description,
      unitKind: t.unitKind,
      unitRoomCount: t.unitRoomCount,
      privatePool: t.privatePool,
      bedType: t.bedType,
      bedCount: t.bedCount,
      maxOccupancy: t.maxOccupancy,
      maxAdults: t.maxAdults,
      maxChildren: t.maxChildren,
      airConditioned: t.airConditioned,
      baseRate: t.baseRate,
      currency: t.currency,
      sizeSqft: t.sizeSqft,
      status: t.status,
      amenities: [...attached]
        .sort((a, b) => a.name.localeCompare(b.name))
        .map((a) => ({ id: a.id, key: a.key, name: a.name, icon: a.icon })),
      ...(roomCount === undefined ? {} : { roomCount }),
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

    return {
      items: rows.map((r) =>
        RoomTypesService.toDto(r, attached.get(r.id) ?? [], counts.get(r.id) ?? 0),
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
    return RoomTypesService.toDto(row, attached.get(row.id) ?? [], counts.get(row.id) ?? 0);
  }

  async create(propertyId: string, dto: RoomTypeInputDto) {
    // Validate the amenity ids BEFORE opening the transaction, so a bad id is a
    // clean 400 rather than a rolled-back insert.
    const attach = await this.amenityCatalogue.resolveForScope(dto.amenityIds ?? [], 'ROOM');

    const row = await this.db.transaction(async (tx) => {
      let created: RoomType;
      try {
        [created] = await tx
          .insert(roomTypes)
          .values({
            propertyId,
            name: dto.name,
            description: dto.description ?? null,
            unitKind: dto.unitKind ?? 'ROOM',
            // A plain room is always a 1-room unit, whatever the client sent.
            unitRoomCount: (dto.unitKind ?? 'ROOM') === 'ROOM' ? 1 : (dto.unitRoomCount ?? 1),
            privatePool: dto.privatePool ?? false,
            bedType: dto.bedType,
            bedCount: dto.bedCount,
            maxOccupancy: dto.maxOccupancy,
            maxAdults: dto.maxAdults,
            maxChildren: dto.maxChildren,
            airConditioned: dto.airConditioned,
            baseRate: dto.baseRate,
            currency: dto.currency ?? 'INR',
            sizeSqft: dto.sizeSqft ?? null,
          })
          .returning();
      } catch (err) {
        if ((err as { code?: string }).code === '23505') throw RoomErrors.roomTypeNameTaken();
        throw err;
      }
      if (attach.length) {
        await tx
          .insert(roomTypeAmenities)
          .values(attach.map((a) => ({ roomTypeId: created.id, amenityId: a.id })));
      }
      return created;
    });

    return RoomTypesService.toDto(row, attach, 0);
  }

  async update(propertyId: string, id: string, dto: UpdateRoomTypeDto) {
    const before = await this.requireRoomType(propertyId, id);

    const patch: Partial<typeof roomTypes.$inferInsert> = { updatedAt: new Date() };
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.description !== undefined) patch.description = dto.description;
    if (dto.unitKind !== undefined) patch.unitKind = dto.unitKind;
    if (dto.unitRoomCount !== undefined) patch.unitRoomCount = dto.unitRoomCount;
    if (dto.privatePool !== undefined) patch.privatePool = dto.privatePool;
    if (dto.bedType !== undefined) patch.bedType = dto.bedType;
    if (dto.bedCount !== undefined) patch.bedCount = dto.bedCount;
    if (dto.maxOccupancy !== undefined) patch.maxOccupancy = dto.maxOccupancy;
    if (dto.maxAdults !== undefined) patch.maxAdults = dto.maxAdults;
    if (dto.maxChildren !== undefined) patch.maxChildren = dto.maxChildren;
    if (dto.airConditioned !== undefined) patch.airConditioned = dto.airConditioned;
    if (dto.baseRate !== undefined) patch.baseRate = dto.baseRate;
    if (dto.currency !== undefined) patch.currency = dto.currency;
    if (dto.sizeSqft !== undefined) patch.sizeSqft = dto.sizeSqft;
    if (dto.status !== undefined) patch.status = dto.status;

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

    const replacingAmenities = dto.amenityIds !== undefined;
    if (Object.keys(patch).length === 1 && !replacingAmenities) {
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
        if ((err as { code?: string }).code === '23505') throw RoomErrors.roomTypeNameTaken();
        throw err;
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
    return {
      before: RoomTypesService.toDto(before),
      after: RoomTypesService.toDto(row, finalAmenities),
    };
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
