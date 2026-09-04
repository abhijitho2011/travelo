import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, isNull, lt, or, sql, type SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { reservations, rooms, type ReservationStatus } from '../../database/schema';
import { FolioService } from './folio.service';

export type FolioListScope = 'open' | 'inhouse' | 'all';

export interface FolioListQuery {
  scope?: FolioListScope;
  /** Guest name, booking code or room number substring. */
  q?: string;
  limit?: number;
}

export interface FolioListItem {
  reservationId: string;
  code: string;
  guestName: string;
  roomNumber: string | null;
  status: ReservationStatus;
  checkIn: string;
  checkOut: string;
  /** Tax-inclusive charges — the folio's `chargesPaise`. */
  totalPaise: number;
  paidPaise: number;
  balancePaise: number;
  updatedAt: Date;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 500;

/** Statuses a folio can exist on. PENDING holds nothing yet; CANCELLED/NO_SHOW owe nothing. */
const FOLIO_STATUSES: ReservationStatus[] = ['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'];

/**
 * The cashier's list: every folio with money on it, across the property.
 *
 * Candidates are picked in SQL from the reservation's cached `paid_paise`
 * (the same cheap pre-filter the desk board uses for its pending-payment
 * tile); the figures on each row are then the AUTHORITATIVE, tax-inclusive
 * ones from `FolioService.summary`, so this list and the folio screen never
 * disagree on a rupee. The `open` scope drops any candidate whose real balance
 * turns out to be settled.
 */
@Injectable()
export class FolioListService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly folio: FolioService,
  ) {}

  async list(propertyId: string, query: FolioListQuery = {}) {
    const scope: FolioListScope = query.scope ?? 'open';
    const limit = Math.min(Math.max(1, query.limit ?? DEFAULT_LIMIT), MAX_LIMIT);

    const conds: SQL[] = [eq(reservations.propertyId, propertyId), isNull(reservations.deletedAt)];
    if (scope === 'inhouse') {
      conds.push(eq(reservations.status, 'CHECKED_IN'));
    } else if (scope === 'open') {
      // In-house always shows (a running bill is open by definition); a
      // booked or departed stay only when the cache says money is still due.
      conds.push(
        or(
          eq(reservations.status, 'CHECKED_IN'),
          and(
            inArray(reservations.status, ['CONFIRMED', 'CHECKED_OUT']),
            lt(reservations.paidPaise, reservations.totalPaise),
          ),
        ) as SQL,
      );
    } else {
      conds.push(inArray(reservations.status, FOLIO_STATUSES));
    }
    const q = query.q?.trim();
    if (q) {
      const like = `%${q}%`;
      conds.push(
        or(
          sql`${reservations.guestName} ILIKE ${like}`,
          sql`${reservations.reservationNumber} ILIKE ${like}`,
          sql`${rooms.number} ILIKE ${like}`,
        ) as SQL,
      );
    }

    const rows = await this.db
      .select({
        id: reservations.id,
        reservationNumber: reservations.reservationNumber,
        guestName: reservations.guestName,
        status: reservations.status,
        checkIn: reservations.checkIn,
        checkOut: reservations.checkOut,
        updatedAt: reservations.updatedAt,
        roomNumber: rooms.number,
      })
      .from(reservations)
      .leftJoin(rooms, eq(reservations.roomId, rooms.id))
      .where(and(...conds))
      .orderBy(desc(reservations.updatedAt))
      .limit(limit);

    const items: FolioListItem[] = [];
    for (const r of rows) {
      const s = await this.folio.summary(r.id);
      if (scope === 'open' && s.balancePaise <= 0) continue;
      items.push({
        reservationId: r.id,
        code: r.reservationNumber,
        guestName: r.guestName,
        roomNumber: r.roomNumber ?? null,
        status: r.status,
        checkIn: r.checkIn,
        checkOut: r.checkOut,
        totalPaise: s.chargesPaise,
        paidPaise: s.netPaidPaise,
        balancePaise: s.balancePaise,
        updatedAt: r.updatedAt,
      });
    }

    return {
      items,
      totals: {
        count: items.length,
        balancePaise: items.reduce((sum, i) => sum + i.balancePaise, 0),
      },
    };
  }
}
