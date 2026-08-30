import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { propertyDailySnapshots, reservations, roomTypes, rooms } from '../../database/schema';

export interface DailyReportRow {
  date: string;
  occupancyPct: number;
  roomsSold: number;
  roomsAvailable: number;
  arrivals: number;
  departures: number;
  noShows: number;
  revenuePaise: number;
  adrPaise: number; // average daily rate = revenue / rooms sold
  revparPaise: number; // revenue per available room = revenue / rooms available
}

/**
 * Hotel-level reporting — the numbers a GM actually asks for, which the
 * platform-only analytics never gave. History comes from the night audit's
 * per-day snapshots; the arrivals/departures manifest is read live.
 */
@Injectable()
export class ReportsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  /** Per-day occupancy / ADR / RevPAR for the last `days` closed days. */
  async occupancyHistory(propertyId: string, days = 30): Promise<DailyReportRow[]> {
    const window = Math.min(Math.max(days, 1), 366);
    const rows = await this.db
      .select()
      .from(propertyDailySnapshots)
      .where(eq(propertyDailySnapshots.propertyId, propertyId))
      .orderBy(desc(propertyDailySnapshots.businessDate))
      .limit(window);
    return rows.map((r) => this.toRow(r)).sort((a, b) => a.date.localeCompare(b.date));
  }

  /** Aggregate ADR / RevPAR / occupancy over the window. */
  async summary(propertyId: string, days = 30) {
    const history = await this.occupancyHistory(propertyId, days);
    if (history.length === 0) {
      return { days: 0, avgOccupancyPct: 0, adrPaise: 0, revparPaise: 0, revenuePaise: 0 };
    }
    const revenue = history.reduce((s, r) => s + r.revenuePaise, 0);
    const roomsSold = history.reduce((s, r) => s + r.roomsSold, 0);
    const roomsAvail = history.reduce((s, r) => s + r.roomsAvailable, 0);
    return {
      days: history.length,
      avgOccupancyPct: roomsAvail > 0 ? Math.round((roomsSold / roomsAvail) * 100) : 0,
      adrPaise: roomsSold > 0 ? Math.round(revenue / roomsSold) : 0,
      revparPaise: roomsAvail > 0 ? Math.round(revenue / roomsAvail) : 0,
      revenuePaise: revenue,
    };
  }

  /** Arrivals and departures for one date — the front desk's daily manifest. */
  async manifest(propertyId: string, date: string) {
    const [arrivals, departures] = await Promise.all([
      this.stayList(propertyId, eq(reservations.checkIn, date), [
        'CONFIRMED',
        'CHECKED_IN',
        'CHECKED_OUT',
      ]),
      this.stayList(propertyId, eq(reservations.checkOut, date), ['CHECKED_IN', 'CHECKED_OUT']),
    ]);
    return { date, arrivals, departures };
  }

  private async stayList(propertyId: string, dateCond: ReturnType<typeof eq>, statuses: string[]) {
    const rows = await this.db
      .select({
        id: reservations.id,
        reservationNumber: reservations.reservationNumber,
        guestName: reservations.guestName,
        guestPhone: reservations.guestPhone,
        status: reservations.status,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        roomTypeName: roomTypes.name,
        roomNumber: rooms.number,
      })
      .from(reservations)
      .leftJoin(roomTypes, eq(reservations.roomTypeId, roomTypes.id))
      .leftJoin(rooms, eq(reservations.roomId, rooms.id))
      .where(
        and(
          eq(reservations.propertyId, propertyId),
          dateCond,
          inArray(reservations.status, statuses as never),
        ),
      )
      .orderBy(asc(reservations.guestName));
    return rows;
  }

  private toRow(r: typeof propertyDailySnapshots.$inferSelect): DailyReportRow {
    return {
      date: r.businessDate,
      occupancyPct: r.occupancyPct,
      roomsSold: r.roomsSold,
      roomsAvailable: r.roomsAvailable,
      arrivals: r.arrivals,
      departures: r.departures,
      noShows: r.noShows,
      revenuePaise: r.revenuePaise,
      adrPaise: r.roomsSold > 0 ? Math.round(r.revenuePaise / r.roomsSold) : 0,
      revparPaise: r.roomsAvailable > 0 ? Math.round(r.revenuePaise / r.roomsAvailable) : 0,
    };
  }
}
