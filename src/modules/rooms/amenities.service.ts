import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, ilike, inArray, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  amenities,
  type Amenity,
  type AmenityScope,
  type AmenityStatus,
} from '../../database/schema';
import { AmenityFilterDto, CreateAmenityDto, UpdateAmenityDto } from './dto';
import { RoomErrors } from './room-errors';

/**
 * The ONE amenity catalogue, managed by the super admin.
 *
 * Deliberately mirrors `LocationsService`: admin-managed reference data that
 * every hotel picks from, so "Wifi" is the same row platform-wide and reporting
 * can group on `key` rather than on whatever each GM typed.
 *
 * NOT `features` / `plan_features` — those are subscription entitlements. The
 * two never share a table, a key space or a service.
 */
@Injectable()
export class AmenitiesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  static toDto(a: Amenity) {
    return {
      id: a.id,
      key: a.key,
      name: a.name,
      scope: a.scope,
      icon: a.icon,
      sortOrder: a.sortOrder,
      status: a.status,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
    };
  }

  /** Admin listing — every status, so archived entries stay manageable. */
  async list(params: AmenityFilterDto = {}) {
    const conds: SQL[] = [];
    if (params.scope) conds.push(eq(amenities.scope, params.scope as AmenityScope));
    if (params.status) conds.push(eq(amenities.status, params.status as AmenityStatus));
    if (params.q) conds.push(ilike(amenities.name, `%${params.q}%`));

    const rows = await this.db
      .select()
      .from(amenities)
      .where(conds.length ? and(...conds) : undefined)
      .orderBy(asc(amenities.scope), asc(amenities.sortOrder), asc(amenities.name));
    return { items: rows.map(AmenitiesService.toDto), total: rows.length };
  }

  /**
   * Picker feed for the staff and owner apps: ACTIVE only.
   *
   * Archiving is what makes this safe. An archived amenity disappears from here
   * but its rows in room_type_amenities / room_amenities / property_amenities
   * are untouched, so a hotel that already ticked it keeps it. Retiring a
   * catalogue entry must never silently strip a feature from live rooms.
   */
  async listActive(scope?: AmenityScope) {
    const conds: SQL[] = [eq(amenities.status, 'ACTIVE')];
    if (scope) conds.push(eq(amenities.scope, scope));
    const rows = await this.db
      .select()
      .from(amenities)
      .where(and(...conds))
      .orderBy(asc(amenities.scope), asc(amenities.sortOrder), asc(amenities.name));
    return { items: rows.map(AmenitiesService.toDto), total: rows.length };
  }

  async create(dto: CreateAmenityDto) {
    try {
      const [row] = await this.db
        .insert(amenities)
        .values({
          key: dto.key,
          name: dto.name,
          scope: dto.scope,
          icon: dto.icon ?? null,
          sortOrder: dto.sortOrder ?? 0,
        })
        .returning();
      return AmenitiesService.toDto(row);
    } catch (err) {
      if ((err as { code?: string }).code === '23505') throw RoomErrors.amenityKeyTaken();
      throw err;
    }
  }

  async update(id: string, dto: UpdateAmenityDto) {
    const before = await this.requireAmenity(id);
    const patch: Partial<typeof amenities.$inferInsert> = { updatedAt: new Date() };
    if (dto.name !== undefined) patch.name = dto.name;
    if (dto.scope !== undefined) patch.scope = dto.scope;
    if (dto.icon !== undefined) patch.icon = dto.icon;
    if (dto.sortOrder !== undefined) patch.sortOrder = dto.sortOrder;
    if (dto.status !== undefined) patch.status = dto.status;

    const [row] = await this.db
      .update(amenities)
      .set(patch)
      .where(eq(amenities.id, id))
      .returning();
    return { before: AmenitiesService.toDto(before), after: AmenitiesService.toDto(row) };
  }

  /**
   * "Delete" ARCHIVES. A hard delete would cascade the join rows away and
   * silently rewrite what every hotel using it offers; archiving only removes
   * it from future pickers. The key stays taken, which is correct — a
   * re-created "wifi" must be the same row, not a second one.
   */
  async archive(id: string) {
    const before = await this.requireAmenity(id);
    const [row] = await this.db
      .update(amenities)
      .set({ status: 'ARCHIVED', updatedAt: new Date() })
      .where(eq(amenities.id, id))
      .returning();
    return { before: AmenitiesService.toDto(before), after: AmenitiesService.toDto(row) };
  }

  private async requireAmenity(id: string): Promise<Amenity> {
    const [row] = await this.db.select().from(amenities).where(eq(amenities.id, id)).limit(1);
    if (!row) throw RoomErrors.amenityNotFound();
    return row;
  }

  /**
   * Resolve the ids a caller wants to attach, refusing anything of the wrong
   * scope. Ids are validated against the catalogue rather than trusted, so a
   * client cannot attach a row that does not exist or a PROPERTY amenity to a
   * room type.
   *
   * ARCHIVED ids are accepted deliberately: an edit that keeps an already-
   * attached (now archived) amenity must not fail.
   */
  async resolveForScope(ids: readonly string[], scope: AmenityScope): Promise<Amenity[]> {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return [];
    const rows = await this.db.select().from(amenities).where(inArray(amenities.id, unique));
    if (rows.length !== unique.length) throw RoomErrors.amenityNotFound();
    if (rows.some((r) => r.scope !== scope)) throw RoomErrors.amenityScopeMismatch(scope);
    return rows;
  }
}
