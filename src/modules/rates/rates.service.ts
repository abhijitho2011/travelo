import { Inject, Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { and, asc, eq, isNull } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { rateOverrides, roomTypes } from '../../database/schema';

/** Rate-override CRUD for a room type (Phase 4, item 4.2). */
@Injectable()
export class RatesService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async list(propertyId: string) {
    return this.db
      .select()
      .from(rateOverrides)
      .where(and(eq(rateOverrides.propertyId, propertyId), isNull(rateOverrides.deletedAt)))
      .orderBy(asc(rateOverrides.startDate));
  }

  async create(
    propertyId: string,
    dto: { roomTypeId: string; startDate: string; endDate: string; ratePaise: number; label?: string },
  ) {
    if (dto.endDate < dto.startDate) {
      throw new BadRequestException('endDate must not be before startDate');
    }
    // The room type must belong to this property.
    const [type] = await this.db
      .select({ id: roomTypes.id })
      .from(roomTypes)
      .where(
        and(
          eq(roomTypes.id, dto.roomTypeId),
          eq(roomTypes.propertyId, propertyId),
          isNull(roomTypes.deletedAt),
        ),
      )
      .limit(1);
    if (!type) throw new NotFoundException('Room type not found');

    const [row] = await this.db
      .insert(rateOverrides)
      .values({
        propertyId,
        roomTypeId: dto.roomTypeId,
        label: dto.label ?? null,
        startDate: dto.startDate,
        endDate: dto.endDate,
        ratePaise: dto.ratePaise,
      })
      .returning();
    return row;
  }

  async remove(propertyId: string, id: string) {
    const [row] = await this.db
      .update(rateOverrides)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(and(eq(rateOverrides.id, id), eq(rateOverrides.propertyId, propertyId)))
      .returning();
    if (!row) throw new NotFoundException('Rate override not found');
    return { deleted: true, id };
  }
}
