import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, inArray, sql, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  hotelStaff,
  incidents,
  securityShifts,
  visitorLogs,
  type HotelStaffRole,
  type SecurityShift,
  type SecurityShiftStatus,
} from '../../database/schema';
import { CreateShiftDto, ShiftFilterDto } from './dto';
import { SecurityErrors } from './security-errors';
import { assertShiftTransition, OPEN_INCIDENT_STATUSES } from './security-rules';

const MAX_ROWS = 200;

/** Security roles whose people appear on the roster and staff list. */
const SECURITY_ROLES: HotelStaffRole[] = ['SECURITY_MANAGER', 'SECURITY_STAFF'];

/**
 * The manager's roster (`security_shifts`), the security staff directory and the
 * oversight dashboard. Everything is PROPERTY-SCOPED — a foreign id 404s — and
 * nothing here touches money.
 */
@Injectable()
export class SecurityShiftsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  static toDto(s: SecurityShift) {
    return {
      id: s.id,
      staffId: s.staffId,
      area: s.area,
      startAt: s.startAt,
      endAt: s.endAt,
      status: s.status,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }

  private async requireStaff(propertyId: string, staffId: string) {
    const [row] = await this.db
      .select({ id: hotelStaff.id })
      .from(hotelStaff)
      .where(and(eq(hotelStaff.id, staffId), eq(hotelStaff.propertyId, propertyId)))
      .limit(1);
    if (!row) throw SecurityErrors.staffNotFound();
    return row;
  }

  async require(propertyId: string, id: string): Promise<SecurityShift> {
    const [row] = await this.db
      .select()
      .from(securityShifts)
      .where(and(eq(securityShifts.id, id), eq(securityShifts.propertyId, propertyId)))
      .limit(1);
    if (!row) throw SecurityErrors.shiftNotFound();
    return row;
  }

  async list(propertyId: string, params: ShiftFilterDto) {
    const conds: SQL[] = [eq(securityShifts.propertyId, propertyId)];
    if (params.status) conds.push(eq(securityShifts.status, params.status as SecurityShiftStatus));
    const rows = await this.db
      .select()
      .from(securityShifts)
      .where(and(...conds))
      .orderBy(desc(securityShifts.startAt))
      .limit(MAX_ROWS);
    return { items: rows.map(SecurityShiftsService.toDto), total: rows.length };
  }

  async create(propertyId: string, dto: CreateShiftDto) {
    await this.requireStaff(propertyId, dto.staffId);
    const [row] = await this.db
      .insert(securityShifts)
      .values({
        propertyId,
        staffId: dto.staffId,
        area: dto.area,
        startAt: new Date(dto.startAt),
        endAt: dto.endAt ? new Date(dto.endAt) : null,
      })
      .returning();
    return SecurityShiftsService.toDto(row);
  }

  async setStatus(propertyId: string, id: string, to: SecurityShiftStatus) {
    const before = await this.require(propertyId, id);
    assertShiftTransition(before.status, to);
    const [row] = await this.db
      .update(securityShifts)
      .set({
        status: to,
        endAt: to === 'ENDED' ? (before.endAt ?? new Date()) : before.endAt,
        updatedAt: new Date(),
      })
      .where(and(eq(securityShifts.id, id), eq(securityShifts.propertyId, propertyId)))
      .returning();
    return { before, after: SecurityShiftsService.toDto(row) };
  }

  /** The property's security staff directory — the roster's people. */
  async roster(propertyId: string) {
    const rows = await this.db
      .select({
        id: hotelStaff.id,
        firstName: hotelStaff.firstName,
        lastName: hotelStaff.lastName,
        role: hotelStaff.role,
        status: hotelStaff.status,
      })
      .from(hotelStaff)
      .where(and(eq(hotelStaff.propertyId, propertyId), inArray(hotelStaff.role, SECURITY_ROLES)));
    return { items: rows, total: rows.length };
  }

  /**
   * The manager's oversight dashboard, one call: guards currently on an ACTIVE
   * shift, visitors on-site, and open incidents by severity.
   */
  async dashboard(propertyId: string) {
    const [activeShifts] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(securityShifts)
      .where(and(eq(securityShifts.propertyId, propertyId), eq(securityShifts.status, 'ACTIVE')));

    const [onSite] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(visitorLogs)
      .where(and(eq(visitorLogs.propertyId, propertyId), sql`${visitorLogs.departedAt} IS NULL`));

    const openRows = await this.db
      .select({ severity: incidents.severity, count: sql<number>`count(*)::int` })
      .from(incidents)
      .where(
        and(
          eq(incidents.propertyId, propertyId),
          inArray(incidents.status, [...OPEN_INCIDENT_STATUSES]),
        ),
      )
      .groupBy(incidents.severity);

    let openIncidents = 0;
    const openBySeverity: Record<string, number> = {};
    for (const r of openRows) {
      openIncidents += r.count;
      openBySeverity[r.severity] = r.count;
    }

    return {
      activeStaff: activeShifts?.count ?? 0,
      visitorsOnSite: onSite?.count ?? 0,
      openIncidents,
      openBySeverity,
    };
  }
}
