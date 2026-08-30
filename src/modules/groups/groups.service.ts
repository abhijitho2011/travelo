import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, asc, desc, eq, isNull, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { bookingGroups, reservations } from '../../database/schema';

/** Group bookings — a master that ties many reservations together (Phase 4). */
@Injectable()
export class GroupsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async create(
    propertyId: string,
    dto: { name: string; contactName?: string; contactPhone?: string; notes?: string },
    actorStaffId: string | null,
  ) {
    const [row] = await this.db
      .insert(bookingGroups)
      .values({
        propertyId,
        name: dto.name,
        contactName: dto.contactName ?? null,
        contactPhone: dto.contactPhone ?? null,
        notes: dto.notes ?? null,
        createdBy: actorStaffId,
      })
      .returning();
    return row;
  }

  async list(propertyId: string) {
    const groups = await this.db
      .select()
      .from(bookingGroups)
      .where(and(eq(bookingGroups.propertyId, propertyId), isNull(bookingGroups.deletedAt)))
      .orderBy(desc(bookingGroups.createdAt));
    // Room count per group in one query.
    const counts = await this.db
      .select({ groupId: reservations.groupId, rooms: sql<number>`count(*)::int` })
      .from(reservations)
      .where(and(eq(reservations.propertyId, propertyId), isNull(reservations.deletedAt)))
      .groupBy(reservations.groupId);
    const byGroup = new Map(counts.map((c) => [c.groupId, c.rooms]));
    return groups.map((g) => ({ ...g, rooms: byGroup.get(g.id) ?? 0 }));
  }

  /** A group plus every reservation in it and the block totals. */
  async get(propertyId: string, id: string) {
    const [group] = await this.db
      .select()
      .from(bookingGroups)
      .where(
        and(
          eq(bookingGroups.id, id),
          eq(bookingGroups.propertyId, propertyId),
          isNull(bookingGroups.deletedAt),
        ),
      )
      .limit(1);
    if (!group) throw new NotFoundException('Group not found');

    const stays = await this.db
      .select({
        id: reservations.id,
        reservationNumber: reservations.reservationNumber,
        guestName: reservations.guestName,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        status: reservations.status,
        totalPaise: reservations.totalPaise,
        paidPaise: reservations.paidPaise,
      })
      .from(reservations)
      .where(
        and(
          eq(reservations.groupId, id),
          eq(reservations.propertyId, propertyId),
          isNull(reservations.deletedAt),
        ),
      )
      .orderBy(asc(reservations.checkIn));

    const totalPaise = stays.reduce((s, r) => s + r.totalPaise, 0);
    const paidPaise = stays.reduce((s, r) => s + r.paidPaise, 0);
    return {
      ...group,
      rooms: stays.length,
      totalPaise,
      paidPaise,
      balancePaise: totalPaise - paidPaise,
      reservations: stays,
    };
  }

  /** Attach an existing reservation to the group (both must be at the property). */
  async attach(propertyId: string, id: string, reservationId: string) {
    const [group] = await this.db
      .select({ id: bookingGroups.id })
      .from(bookingGroups)
      .where(and(eq(bookingGroups.id, id), eq(bookingGroups.propertyId, propertyId)))
      .limit(1);
    if (!group) throw new NotFoundException('Group not found');
    const [row] = await this.db
      .update(reservations)
      .set({ groupId: id, updatedAt: new Date() })
      .where(and(eq(reservations.id, reservationId), eq(reservations.propertyId, propertyId)))
      .returning();
    if (!row) throw new NotFoundException('Reservation not found');
    return { attached: true, reservationId, groupId: id };
  }
}
