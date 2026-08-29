import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, ilike, inArray, isNull, sql, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  amenities,
  properties,
  roomAmenities,
  rooms,
  roomTypes,
  type Amenity,
  type Room,
  type RoomStatus,
} from '../../database/schema';
import { AmenitiesService } from './amenities.service';
import { RoomTypesService } from './room-types.service';
import { effectiveAmenities, type AmenityRef } from './effective-amenities';
import {
  BulkCreateRoomsDto,
  CreateRoomDto,
  MAX_BULK_ROOMS,
  RoomFilterDto,
  UpdateRoomDto,
} from './dto';
import { RoomErrors } from './room-errors';

const MAX_LIMIT = 200;

/** Any transaction handle or the pool itself — both expose the same query API. */
type Tx = Pick<Database, 'select' | 'insert' | 'update' | 'delete'>;

/**
 * Rooms — the physical unit. Reception assigns one, housekeeping cleans one,
 * occupancy counts them.
 *
 * Two rules run through every method:
 *  1. Tenant isolation. A room is only ever resolved by
 *     (id, propertyId = the caller's own, deletedAt IS NULL). Cross-property
 *     reads 404, indistinguishable from a miss.
 *  2. `properties.room_count` is DERIVED, never typed. Every create and delete
 *     recomputes it from live room rows INSIDE the same transaction, so the
 *     number an owner sees on their portfolio can never drift from the rooms
 *     that actually exist. The column stays because other code reads it.
 */
@Injectable()
export class RoomsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly roomTypesService: RoomTypesService,
    private readonly amenityCatalogue: AmenitiesService,
  ) {}

  // ---------- roomCount, derived ----------

  /**
   * Recompute `properties.room_count` from live rooms.
   *
   * Takes the transaction handle rather than `this.db` on purpose: called with
   * the SAME `tx` as the insert/delete that changed the rooms, so the count and
   * the rows it counts commit together. A crash between them is not reachable.
   */
  static async recountRooms(tx: Tx, propertyId: string): Promise<number> {
    const [{ count }] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(rooms)
      .where(and(eq(rooms.propertyId, propertyId), isNull(rooms.deletedAt)));
    await tx
      .update(properties)
      .set({ roomCount: count, updatedAt: new Date() })
      .where(eq(properties.id, propertyId));
    return count;
  }

  // ---------- Reads ----------

  static conditions(propertyId: string, params: RoomFilterDto): SQL[] {
    const conds: SQL[] = [eq(rooms.propertyId, propertyId), isNull(rooms.deletedAt)];
    if (params.status) conds.push(eq(rooms.status, params.status as RoomStatus));
    if (params.roomTypeId) conds.push(eq(rooms.roomTypeId, params.roomTypeId));
    if (params.floor) conds.push(eq(rooms.floor, params.floor));
    if (params.q) conds.push(ilike(rooms.number, `%${params.q}%`));
    return conds;
  }

  /** Per-room EXTRAS, one query for the whole page. */
  private async extrasByRoom(roomIds: readonly string[]): Promise<Map<string, Amenity[]>> {
    const out = new Map<string, Amenity[]>();
    if (roomIds.length === 0) return out;
    const rows = await this.db
      .select({ roomId: roomAmenities.roomId, amenity: amenities })
      .from(roomAmenities)
      .innerJoin(amenities, eq(roomAmenities.amenityId, amenities.id))
      .where(inArray(roomAmenities.roomId, [...roomIds]));
    for (const r of rows) {
      const list = out.get(r.roomId);
      if (list) list.push(r.amenity);
      else out.set(r.roomId, [r.amenity]);
    }
    return out;
  }

  static toDto(
    r: Room,
    type: { id: string; name: string; bedType: string; airConditioned: boolean } | undefined,
    amenityList: AmenityRef[],
  ) {
    return {
      id: r.id,
      propertyId: r.propertyId,
      roomTypeId: r.roomTypeId,
      roomTypeName: type?.name ?? null,
      bedType: type?.bedType ?? null,
      airConditioned: type?.airConditioned ?? null,
      number: r.number,
      floor: r.floor,
      status: r.status,
      notes: r.notes,
      /** Type amenities ∪ per-room extras — see `effectiveAmenities`. */
      amenities: amenityList,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  /**
   * Hydrate a page of rooms with their type and their EFFECTIVE amenities.
   * Three queries for the page regardless of its size.
   */
  private async hydrate(rows: Room[]) {
    if (rows.length === 0) return [];
    const typeIds = [...new Set(rows.map((r) => r.roomTypeId))];
    const typeRows = await this.db
      .select({
        id: roomTypes.id,
        name: roomTypes.name,
        bedType: roomTypes.bedType,
        airConditioned: roomTypes.airConditioned,
      })
      .from(roomTypes)
      .where(inArray(roomTypes.id, typeIds));
    const typeById = new Map(typeRows.map((t) => [t.id, t]));

    const typeAmenities = await this.roomTypesService.amenitiesByType(typeIds);
    const extras = await this.extrasByRoom(rows.map((r) => r.id));

    return rows.map((r) =>
      RoomsService.toDto(
        r,
        typeById.get(r.roomTypeId),
        effectiveAmenities(typeAmenities.get(r.roomTypeId) ?? [], extras.get(r.id) ?? []),
      ),
    );
  }

  async list(propertyId: string, params: RoomFilterDto = {}) {
    const limit = Math.min(params.limit ?? 100, MAX_LIMIT);
    const offset = params.offset ?? 0;
    const where = and(...RoomsService.conditions(propertyId, params));

    const rows = await this.db
      .select()
      .from(rooms)
      .where(where)
      // Housekeeping works a floor at a time, so floor is the primary sort.
      .orderBy(asc(rooms.floor), asc(rooms.number))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(rooms)
      .where(where);

    return { items: await this.hydrate(rows), total: count, limit, offset };
  }

  async get(propertyId: string, id: string) {
    const row = await this.requireRoom(propertyId, id);
    const [dto] = await this.hydrate([row]);
    return dto;
  }

  // ---------- Writes ----------

  async create(propertyId: string, dto: CreateRoomDto) {
    // Both of these 404/400 BEFORE the transaction opens, so a bad request is
    // never a rolled-back write.
    await this.roomTypesService.requireRoomType(propertyId, dto.roomTypeId);
    const extras = await this.amenityCatalogue.resolveForScope(dto.amenityIds ?? [], 'ROOM');

    const { row, roomCount } = await this.db.transaction(async (tx) => {
      let created: Room;
      try {
        [created] = await tx
          .insert(rooms)
          .values({
            propertyId,
            roomTypeId: dto.roomTypeId,
            number: dto.number,
            floor: dto.floor ?? null,
            status: dto.status ?? 'AVAILABLE',
            notes: dto.notes ?? null,
          })
          .returning();
      } catch (err) {
        if ((err as { code?: string }).code === '23505') {
          throw RoomErrors.roomNumberTaken(dto.number);
        }
        throw err;
      }
      if (extras.length) {
        await tx
          .insert(roomAmenities)
          .values(extras.map((a) => ({ roomId: created.id, amenityId: a.id })));
      }
      // Same transaction as the insert — the count and the room commit together.
      const count = await RoomsService.recountRooms(tx as unknown as Tx, propertyId);
      return { row: created, roomCount: count };
    });

    const [created] = await this.hydrate([row]);
    return { ...created, propertyRoomCount: roomCount };
  }

  /**
   * Expand a bulk request into the list of room numbers it asks for.
   *
   * Accepts either an explicit `numbers` array or a numeric range
   * (`prefix` + `from`..`to` + `pad`), because both are how people actually
   * describe a floor: "301 to 320" or "301, 302, 305".
   *
   * Static and pure so the expansion is tested without a database.
   */
  static expandNumbers(dto: BulkCreateRoomsDto): string[] {
    const out: string[] = [];
    if (dto.numbers?.length) {
      for (const n of dto.numbers) {
        const trimmed = n.trim();
        if (trimmed) out.push(trimmed);
      }
    } else if (dto.from !== undefined && dto.to !== undefined) {
      const from = Math.min(dto.from, dto.to);
      const to = Math.max(dto.from, dto.to);
      if (to - from + 1 > MAX_BULK_ROOMS) {
        throw RoomErrors.bulkTooLarge(to - from + 1, MAX_BULK_ROOMS);
      }
      for (let i = from; i <= to; i += 1) {
        const body = dto.pad ? String(i).padStart(dto.pad, '0') : String(i);
        out.push(`${dto.prefix ?? ''}${body}`);
      }
    }
    // De-duplicate WITHIN the request too — "301, 301" is one room, and
    // otherwise the insert would trip its own unique index.
    return [...new Set(out)];
  }

  /**
   * Bulk create, transactional and safe on duplicates.
   *
   * A GM opening a 40-room floor cannot be asked to do it one modal at a time,
   * and cannot be punished for the four rooms that already exist. So: existing
   * numbers are read inside the transaction and SKIPPED (reported back by
   * number), and everything else is inserted in one statement. Either the whole
   * batch lands or none of it does — there is no half-created floor.
   */
  async bulkCreate(propertyId: string, dto: BulkCreateRoomsDto) {
    await this.roomTypesService.requireRoomType(propertyId, dto.roomTypeId);
    const requested = RoomsService.expandNumbers(dto);
    if (requested.length === 0) throw RoomErrors.nothingToCreate();

    const result = await this.db.transaction(async (tx) => {
      // Read the clash set inside the transaction: outside it, a concurrent
      // create could slip a number in between the check and the insert.
      const existing = await tx
        .select({ number: rooms.number })
        .from(rooms)
        .where(
          and(
            eq(rooms.propertyId, propertyId),
            isNull(rooms.deletedAt),
            inArray(rooms.number, requested),
          ),
        );
      const taken = new Set(existing.map((r) => r.number));
      const toCreate = requested.filter((n) => !taken.has(n));

      let created: Room[] = [];
      if (toCreate.length) {
        created = await tx
          .insert(rooms)
          .values(
            toCreate.map((number) => ({
              propertyId,
              roomTypeId: dto.roomTypeId,
              number,
              floor: dto.floor ?? null,
              status: dto.status ?? ('AVAILABLE' as RoomStatus),
              notes: null,
            })),
          )
          .returning();
      }
      const roomCount = await RoomsService.recountRooms(tx as unknown as Tx, propertyId);
      return { created, skipped: requested.filter((n) => taken.has(n)), roomCount };
    });

    return {
      requested: requested.length,
      created: result.created.length,
      /** The numbers that already existed — named, so the GM can go look. */
      skipped: result.skipped,
      items: await this.hydrate(result.created),
      propertyRoomCount: result.roomCount,
    };
  }

  async update(propertyId: string, id: string, dto: UpdateRoomDto) {
    const before = await this.requireRoom(propertyId, id);
    if (dto.roomTypeId !== undefined) {
      // A room may only be moved to a type at the SAME property.
      await this.roomTypesService.requireRoomType(propertyId, dto.roomTypeId);
    }

    const patch: Partial<typeof rooms.$inferInsert> = { updatedAt: new Date() };
    if (dto.roomTypeId !== undefined) patch.roomTypeId = dto.roomTypeId;
    if (dto.number !== undefined) patch.number = dto.number;
    if (dto.floor !== undefined) patch.floor = dto.floor;
    if (dto.notes !== undefined) patch.notes = dto.notes;
    if (dto.status !== undefined) patch.status = dto.status;

    const replacingAmenities = dto.amenityIds !== undefined;
    if (Object.keys(patch).length === 1 && !replacingAmenities) {
      throw RoomErrors.nothingToUpdate();
    }
    const extras = replacingAmenities
      ? await this.amenityCatalogue.resolveForScope(dto.amenityIds ?? [], 'ROOM')
      : [];

    const row = await this.db.transaction(async (tx) => {
      let updated: Room;
      try {
        [updated] = await tx.update(rooms).set(patch).where(eq(rooms.id, id)).returning();
      } catch (err) {
        if ((err as { code?: string }).code === '23505') {
          throw RoomErrors.roomNumberTaken(dto.number ?? before.number);
        }
        throw err;
      }
      if (replacingAmenities) {
        await tx.delete(roomAmenities).where(eq(roomAmenities.roomId, id));
        if (extras.length) {
          await tx
            .insert(roomAmenities)
            .values(extras.map((a) => ({ roomId: id, amenityId: a.id })));
        }
      }
      return updated;
    });

    const [after] = await this.hydrate([row]);
    return { before: { id: before.id, number: before.number, status: before.status }, after };
  }

  /**
   * The NARROW status endpoint, kept separate from `update` on purpose.
   *
   * Turning a room over is the single most frequent write in a hotel and the
   * one the most roles need — housekeeping, attendants, reception. Folding it
   * into `room.update` would mean handing a room attendant the ability to
   * renumber a floor or move a room to a pricier type. So this route asks for
   * `room.status.update` and touches ONLY the status column.
   */
  async setStatus(propertyId: string, id: string, status: RoomStatus, note?: string) {
    const before = await this.requireRoom(propertyId, id);
    const patch: Partial<typeof rooms.$inferInsert> = { status, updatedAt: new Date() };
    if (note !== undefined && note !== '') patch.notes = note;

    const [row] = await this.db.update(rooms).set(patch).where(eq(rooms.id, id)).returning();
    return {
      id: row.id,
      number: row.number,
      previousStatus: before.status,
      status: row.status,
      updatedAt: row.updatedAt,
    };
  }

  /** Soft delete, with the room count recomputed in the same transaction. */
  async remove(propertyId: string, id: string) {
    const before = await this.requireRoom(propertyId, id);
    const now = new Date();
    const roomCount = await this.db.transaction(async (tx) => {
      await tx.update(rooms).set({ deletedAt: now, updatedAt: now }).where(eq(rooms.id, id));
      return RoomsService.recountRooms(tx as unknown as Tx, propertyId);
    });
    return {
      id,
      deleted: true,
      number: before.number,
      propertyRoomCount: roomCount,
    };
  }

  /** The single choke point: (id, propertyId, not deleted) or 404. */
  async requireRoom(propertyId: string, id: string): Promise<Room> {
    const [row] = await this.db
      .select()
      .from(rooms)
      .where(and(eq(rooms.id, id), eq(rooms.propertyId, propertyId), isNull(rooms.deletedAt)))
      .limit(1);
    if (!row) throw RoomErrors.roomNotFound();
    return row;
  }
}
