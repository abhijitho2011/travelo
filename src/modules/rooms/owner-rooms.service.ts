import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { amenities, properties, propertyAmenities } from '../../database/schema';
import { AmenitiesService } from './amenities.service';
import { RoomTypesService } from './room-types.service';
import { RoomsService } from './rooms.service';
import { RoomFilterDto, RoomTypeFilterDto } from './dto';
import { RoomErrors } from './room-errors';

/**
 * The owner's view of their own hotels' inventory.
 *
 * The split with the staff surface is deliberate and matches how a hotel
 * actually works:
 *   - PROPERTY amenities are the owner's to set. "Does this hotel have a pool?"
 *     is a fact about the business, decided by whoever owns it.
 *   - Rooms and room types are OPERATIONAL. The GM creates them, renumbers them
 *     and retires them. The owner reads them so the portfolio view shows real
 *     numbers, and writes none of them.
 *
 * Every method resolves the property by (id, ownerId, not deleted) first, so an
 * owner asking about somebody else's hotel gets the same 404 as one asking
 * about a hotel that does not exist.
 */
@Injectable()
export class OwnerRoomsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly amenityCatalogue: AmenitiesService,
    private readonly roomTypes: RoomTypesService,
    private readonly rooms: RoomsService,
  ) {}

  private async requireOwnedProperty(ownerId: string, propertyId: string) {
    const [row] = await this.db
      .select({ id: properties.id, name: properties.name, roomCount: properties.roomCount })
      .from(properties)
      .where(
        and(
          eq(properties.id, propertyId),
          eq(properties.ownerId, ownerId),
          isNull(properties.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw RoomErrors.propertyNotFound();
    return row;
  }

  /**
   * What this hotel offers, plus the full ACTIVE catalogue to pick from — one
   * call, because the editor needs both and a second round trip to render a
   * checklist is wasted latency.
   */
  async getPropertyAmenities(ownerId: string, propertyId: string) {
    await this.requireOwnedProperty(ownerId, propertyId);
    const selected = await this.db
      .select({ amenity: amenities })
      .from(propertyAmenities)
      .innerJoin(amenities, eq(propertyAmenities.amenityId, amenities.id))
      .where(eq(propertyAmenities.propertyId, propertyId))
      .orderBy(asc(amenities.sortOrder), asc(amenities.name));
    const catalogue = await this.amenityCatalogue.listActive('PROPERTY');
    return {
      selected: selected.map((r) => AmenitiesService.toDto(r.amenity)),
      selectedIds: selected.map((r) => r.amenity.id),
      catalogue: catalogue.items,
    };
  }

  /**
   * PUT semantics: the body is the COMPLETE desired set, so an id left out is
   * removed. Clear-then-insert inside one transaction, so a failure can never
   * leave a hotel advertising half its facilities.
   */
  async setPropertyAmenities(ownerId: string, propertyId: string, amenityIds: string[]) {
    await this.requireOwnedProperty(ownerId, propertyId);
    // Refuse ROOM-scoped ids here: "Bathtub" is not a hotel facility.
    const resolved = await this.amenityCatalogue.resolveForScope(amenityIds, 'PROPERTY');

    await this.db.transaction(async (tx) => {
      await tx.delete(propertyAmenities).where(eq(propertyAmenities.propertyId, propertyId));
      if (resolved.length) {
        await tx
          .insert(propertyAmenities)
          .values(resolved.map((a) => ({ propertyId, amenityId: a.id })));
      }
    });

    return {
      propertyId,
      selected: resolved
        .slice()
        .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name))
        .map(AmenitiesService.toDto),
    };
  }

  /** Read-only. Owners do not create room types — that is operational. */
  async listRoomTypes(ownerId: string, propertyId: string, params: RoomTypeFilterDto) {
    await this.requireOwnedProperty(ownerId, propertyId);
    return this.roomTypes.list(propertyId, params);
  }

  /** Read-only, same reasoning. */
  async listRooms(ownerId: string, propertyId: string, params: RoomFilterDto) {
    await this.requireOwnedProperty(ownerId, propertyId);
    return this.rooms.list(propertyId, params);
  }
}
