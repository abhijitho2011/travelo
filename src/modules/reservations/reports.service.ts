import { BadRequestException, Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, inArray, sql } from 'drizzle-orm';
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

  /**
   * The custom report builder — a constrained query, never raw SQL. The
   * caller picks an entity, a date window, optional filters, a grouping and
   * measures from fixed whitelists; the service assembles the SQL. Everything
   * is scoped to the property, and each entity's date column is fixed.
   */
  async customReport(propertyId: string, q: CustomReportQuery) {
    const spec = CUSTOM_REPORT_ENTITIES[q.entity];
    if (!spec) throw new BadRequestException('Unknown entity');
    const groupCol = q.groupBy ? spec.dimensions[q.groupBy] : null;
    if (q.groupBy && !groupCol)
      throw new BadRequestException(`Cannot group ${q.entity} by ${q.groupBy}`);
    const measures = (q.measures?.length ? q.measures : ['count']).map((m) => {
      const expr = spec.measures[m];
      if (!expr) throw new BadRequestException(`Unknown measure ${m} for ${q.entity}`);
      return { key: m, expr };
    });
    const where: string[] = [
      `${spec.propertyCol} = '${propertyId.replace(/'/g, '')}'`,
      `${spec.dateCol} >= '${q.from}'`,
      `${spec.dateCol} <= '${q.to}'`,
    ];
    if (spec.softDelete) where.push(`${spec.softDelete} is null`);
    for (const f of q.filters ?? []) {
      const col = spec.dimensions[f.field];
      if (!col) throw new BadRequestException(`Cannot filter ${q.entity} by ${f.field}`);
      const vals = f.values.map((v) => `'${String(v).replace(/'/g, "''")}'`).join(',');
      where.push(`${col} in (${vals})`);
    }
    const select = [
      groupCol ? `${groupCol} as "group"` : `null as "group"`,
      ...measures.map((m) => `${m.expr} as "${m.key}"`),
    ].join(', ');
    const groupSql = groupCol ? ` group by ${groupCol}` : '';
    const orderSql = groupCol
      ? ` order by ${measures[0].key === 'count' ? '"count"' : `"${measures[0].key}"`} desc nulls last`
      : '';
    const text = `select ${select} from ${spec.table}${where.length ? ` where ${where.join(' and ')}` : ''}${groupSql}${orderSql} limit 500`;
    const res = await this.db.execute(sql.raw(text));
    const rows =
      (res as unknown as { rows: Record<string, unknown>[] }).rows ??
      (res as unknown as Record<string, unknown>[]);
    // The assembled SQL is returned so the report shows exactly what ran.
    return {
      query: text,
      entity: q.entity,
      from: q.from,
      to: q.to,
      groupBy: q.groupBy ?? null,
      measures: measures.map((m) => m.key),
      rows,
    };
  }
}

export interface CustomReportQuery {
  entity: keyof typeof CUSTOM_REPORT_ENTITIES;
  from: string;
  to: string;
  groupBy?: string;
  measures?: string[];
  filters?: { field: string; values: (string | number)[] }[];
}

/**
 * What the builder may touch. Dimensions and measures are SQL fragments the
 * builder chooses BY NAME — a client never sends SQL.
 */
export const CUSTOM_REPORT_ENTITIES: Record<
  string,
  {
    table: string;
    propertyCol: string;
    dateCol: string;
    softDelete?: string;
    dimensions: Record<string, string>;
    measures: Record<string, string>;
  }
> = {
  reservations: {
    table: 'reservations',
    propertyCol: 'property_id',
    dateCol: 'check_in',
    softDelete: 'deleted_at',
    dimensions: {
      status: 'status',
      source: 'source',
      segment: "coalesce(segment, '')",
      roomType: 'room_type_id',
      month: "to_char(check_in, 'YYYY-MM')",
      week: "to_char(check_in, 'IYYY-IW')",
      day: 'check_in::text',
    },
    measures: {
      count: 'count(*)::int',
      nights: 'coalesce(sum(check_out - check_in), 0)::int',
      revenuePaise: 'coalesce(sum(total_paise), 0)::bigint',
      paidPaise: 'coalesce(sum(paid_paise), 0)::bigint',
      avgRatePaise: 'coalesce(avg(rate_paise), 0)::bigint',
      adults: 'coalesce(sum(adults), 0)::int',
    },
  },
  payments: {
    table: 'folio_payments',
    propertyCol: 'property_id',
    dateCol: 'collected_at::date',
    dimensions: {
      method: 'method',
      direction: 'direction',
      month: "to_char(collected_at, 'YYYY-MM')",
      day: 'collected_at::date::text',
    },
    measures: {
      count: 'count(*)::int',
      amountPaise:
        "coalesce(sum(case when direction = 'REFUND' then -amount_paise else amount_paise end), 0)::bigint",
    },
  },
  orders: {
    table: 'restaurant_orders',
    propertyCol: 'property_id',
    dateCol: 'created_at::date',
    dimensions: {
      status: 'status',
      paymentMethod: "coalesce(payment_method, '')",
      month: "to_char(created_at, 'YYYY-MM')",
      day: 'created_at::date::text',
    },
    measures: {
      count: 'count(*)::int',
      totalPaise: 'coalesce(sum(total_paise), 0)::bigint',
      discountPaise: 'coalesce(sum(discount_paise), 0)::bigint',
      taxPaise: 'coalesce(sum(tax_paise), 0)::bigint',
    },
  },
  expenses: {
    table: 'expenses',
    propertyCol: 'property_id',
    dateCol: 'incurred_on::date',
    softDelete: 'deleted_at',
    dimensions: {
      category: 'category',
      status: 'status',
      vendor: "coalesce(vendor, '')",
      month: "to_char(incurred_on, 'YYYY-MM')",
    },
    measures: { count: 'count(*)::int', amountPaise: 'coalesce(sum(amount_paise), 0)::bigint' },
  },
  nightAudit: {
    table: 'property_daily_snapshots',
    propertyCol: 'property_id',
    dateCol: 'business_date',
    dimensions: { month: "to_char(business_date, 'YYYY-MM')", day: 'business_date::text' },
    measures: {
      days: 'count(*)::int',
      revenuePaise: 'coalesce(sum(revenue_paise), 0)::bigint',
      roomsSold: 'coalesce(sum(rooms_sold), 0)::int',
      roomsAvailable: 'coalesce(sum(rooms_available), 0)::int',
      noShows: 'coalesce(sum(no_shows), 0)::int',
    },
  },
};
