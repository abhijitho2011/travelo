import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, isNull, or, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { guestProfiles, reservations } from '../../database/schema';

export interface GuestSummary {
  phone: string;
  name: string;
  stays: number;
  lastStay: string | null;
  totalSpentPaise: number;
  blacklisted: boolean;
}

/**
 * Guest CRM. Repeat-guest recognition, stay history and a blacklist — none of
 * which the denormalised guest text on each reservation could give.
 *
 * The stay HISTORY is the reservations themselves, grouped by phone (the stable
 * identifier a hotel actually has); the guest_profiles overlay carries only the
 * cross-stay facts — notes and the blacklist.
 */
@Injectable()
export class GuestsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Distinct guests seen at the property, newest stay first. `q` matches name or phone. */
  async search(propertyId: string, q?: string, limit = 50): Promise<GuestSummary[]> {
    const conds = [eq(reservations.propertyId, propertyId), isNull(reservations.deletedAt)];
    if (q && q.trim()) {
      const like = `%${q.trim()}%`;
      conds.push(or(ilike(reservations.guestName, like), ilike(reservations.guestPhone, like))!);
    }
    const rows = await this.db
      .select({
        phone: reservations.guestPhone,
        name: sql<string>`max(${reservations.guestName})`,
        stays: sql<number>`count(*)::int`,
        lastStay: sql<string>`max(${reservations.checkOut})`,
        totalSpentPaise: sql<number>`coalesce(sum(${reservations.paidPaise}),0)::int`,
      })
      .from(reservations)
      .where(and(...conds))
      .groupBy(reservations.guestPhone)
      .orderBy(desc(sql`max(${reservations.checkOut})`))
      .limit(Math.min(Math.max(limit, 1), 200));

    // Overlay blacklist flags for the phones we found.
    const flags = await this.db
      .select({ phone: guestProfiles.phone, blacklisted: guestProfiles.blacklisted })
      .from(guestProfiles)
      .where(eq(guestProfiles.propertyId, propertyId));
    const blacklist = new Map(flags.map((f) => [f.phone, f.blacklisted]));

    return rows.map((r) => ({
      phone: r.phone,
      name: r.name ?? 'Guest',
      stays: r.stays,
      lastStay: r.lastStay ?? null,
      totalSpentPaise: r.totalSpentPaise,
      blacklisted: blacklist.get(r.phone) ?? false,
    }));
  }

  /** One guest's overlay plus their full stay history at this property. */
  async profile(propertyId: string, phone: string) {
    const [overlay] = await this.db
      .select()
      .from(guestProfiles)
      .where(and(eq(guestProfiles.propertyId, propertyId), eq(guestProfiles.phone, phone)))
      .limit(1);

    const history = await this.db
      .select({
        id: reservations.id,
        reservationNumber: reservations.reservationNumber,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        status: reservations.status,
        totalPaise: reservations.totalPaise,
        paidPaise: reservations.paidPaise,
      })
      .from(reservations)
      .where(
        and(
          eq(reservations.propertyId, propertyId),
          eq(reservations.guestPhone, phone),
          isNull(reservations.deletedAt),
        ),
      )
      .orderBy(desc(reservations.checkIn));

    const name = overlay?.name ?? history[0]?.reservationNumber ?? 'Guest';
    return {
      phone,
      name: overlay?.name ?? (history.length ? undefined : name),
      blacklisted: overlay?.blacklisted ?? false,
      blacklistReason: overlay?.blacklistReason ?? null,
      notes: overlay?.notes ?? null,
      idType: overlay?.idType ?? null,
      idNumber: overlay?.idNumber ?? null,
      stays: history.length,
      history,
    };
  }

  /** Upsert the overlay — blacklist toggle, notes, ID on file. */
  async upsertProfile(
    propertyId: string,
    phone: string,
    dto: {
      name?: string;
      email?: string;
      notes?: string;
      blacklisted?: boolean;
      blacklistReason?: string;
      idType?: string;
      idNumber?: string;
    },
  ) {
    const [row] = await this.db
      .insert(guestProfiles)
      .values({
        propertyId,
        phone,
        name: dto.name ?? null,
        email: dto.email ?? null,
        notes: dto.notes ?? null,
        blacklisted: dto.blacklisted ?? false,
        blacklistReason: dto.blacklistReason ?? null,
        idType: dto.idType ?? null,
        idNumber: dto.idNumber ?? null,
      })
      .onConflictDoUpdate({
        target: [guestProfiles.propertyId, guestProfiles.phone],
        set: {
          name: dto.name ?? sql`${guestProfiles.name}`,
          email: dto.email ?? sql`${guestProfiles.email}`,
          notes: dto.notes ?? sql`${guestProfiles.notes}`,
          blacklisted: dto.blacklisted ?? sql`${guestProfiles.blacklisted}`,
          blacklistReason: dto.blacklistReason ?? sql`${guestProfiles.blacklistReason}`,
          idType: dto.idType ?? sql`${guestProfiles.idType}`,
          idNumber: dto.idNumber ?? sql`${guestProfiles.idNumber}`,
          updatedAt: new Date(),
        },
      })
      .returning();
    return row;
  }
}
