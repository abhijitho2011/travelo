import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, desc, eq, ilike, isNull, or, sql, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  hotelStaff,
  hotelStaffRoleValues,
  hotelStaffStatusValues,
  owners,
  properties,
  staffSessions,
  HotelStaffRole,
  HotelStaffStatus,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';

/** Statuses the super-admin may set on any staff row, platform-wide. */
export const adminAssignableStaffStatusValues = [
  'ACTIVE',
  'BLOCKED',
  'SUSPENDED',
  'DEACTIVATED',
] as const;

export interface StaffListParams {
  limit?: number;
  offset?: number;
  /** Matches property name OR staff name (first/last/full). */
  q?: string;
  /** Filter by the staff member's state (stored as a text name). */
  state?: string;
  propertyId?: string;
  ownerId?: string;
  role?: string;
  status?: string;
}

/**
 * Cross-tenant directory of ALL hotel staff — the GM/AGM an owner created and
 * everyone a GM went on to hire, across all 23 roles. Every surface (admin,
 * owner portal, staff app) reads the same `hotel_staff` table; this service is
 * the platform-wide view of it. Soft-deleted rows are always excluded.
 */
@Injectable()
export class StaffService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  private conditions(params: StaffListParams): SQL[] {
    const conds: SQL[] = [isNull(hotelStaff.deletedAt)];
    if (params.propertyId) conds.push(eq(hotelStaff.propertyId, params.propertyId));
    if (params.ownerId) conds.push(eq(hotelStaff.ownerId, params.ownerId));
    if (params.role) conds.push(eq(hotelStaff.role, params.role as HotelStaffRole));
    if (params.status) conds.push(eq(hotelStaff.status, params.status as HotelStaffStatus));
    // State is stored as a plain text name; match it case-insensitively so the
    // admin can pass the catalogue name resolved from the location dropdown.
    if (params.state) conds.push(ilike(hotelStaff.state, params.state));
    if (params.q) {
      const term = `%${params.q}%`;
      conds.push(
        or(
          ilike(properties.name, term),
          ilike(hotelStaff.firstName, term),
          ilike(hotelStaff.lastName, term),
          ilike(sql`${hotelStaff.firstName} || ' ' || ${hotelStaff.lastName}`, term),
          ilike(hotelStaff.email, term),
        )!,
      );
    }
    return conds;
  }

  async list(params: StaffListParams) {
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;
    const where = and(...this.conditions(params));

    const rows = await this.db
      .select({
        s: hotelStaff,
        ownerName: owners.company,
        ownerContact: owners.name,
        propertyName: properties.name,
      })
      .from(hotelStaff)
      .leftJoin(owners, eq(hotelStaff.ownerId, owners.id))
      .leftJoin(properties, eq(hotelStaff.propertyId, properties.id))
      .where(where)
      .orderBy(desc(hotelStaff.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(hotelStaff)
      .leftJoin(owners, eq(hotelStaff.ownerId, owners.id))
      .leftJoin(properties, eq(hotelStaff.propertyId, properties.id))
      .where(where);

    return {
      items: rows.map((r) => this.serialize(r)),
      total,
      limit,
      offset,
    };
  }

  async get(id: string) {
    const [row] = await this.db
      .select({
        s: hotelStaff,
        ownerName: owners.company,
        ownerContact: owners.name,
        propertyName: properties.name,
      })
      .from(hotelStaff)
      .leftJoin(owners, eq(hotelStaff.ownerId, owners.id))
      .leftJoin(properties, eq(hotelStaff.propertyId, properties.id))
      .where(and(eq(hotelStaff.id, id), isNull(hotelStaff.deletedAt)))
      .limit(1);
    if (!row) throw new NotFoundException('Staff member not found');
    return this.serialize(row);
  }

  private serialize(r: {
    s: typeof hotelStaff.$inferSelect;
    ownerName: string | null;
    ownerContact: string | null;
    propertyName: string | null;
  }) {
    const s = r.s;
    return {
      id: s.id,
      firstName: s.firstName,
      lastName: s.lastName,
      fullName: `${s.firstName} ${s.lastName}`.trim(),
      email: s.email,
      mobile: s.mobile,
      role: s.role,
      status: s.status,
      state: s.state,
      district: s.district,
      address: s.address,
      pinCode: s.pinCode,
      department: s.department,
      employeeId: s.employeeId,
      lastLoginAt: s.lastLoginAt,
      ownerId: s.ownerId,
      ownerName: r.ownerName ?? r.ownerContact ?? null,
      propertyId: s.propertyId,
      propertyName: r.propertyName ?? null,
      createdAt: s.createdAt,
      updatedAt: s.updatedAt,
    };
  }

  /**
   * Platform-wide staff status change (block / suspend / reactivate). Reserved
   * for `staff.manage`; every call is written to the audit log with the acting
   * admin (resolved from the request context), the before/after status and the
   * operator's reason.
   */
  async setStatus(id: string, status: string, reason?: string) {
    const [existing] = await this.db
      .select({ id: hotelStaff.id, status: hotelStaff.status, propertyId: hotelStaff.propertyId })
      .from(hotelStaff)
      .where(and(eq(hotelStaff.id, id), isNull(hotelStaff.deletedAt)))
      .limit(1);
    if (!existing) throw new NotFoundException('Staff member not found');

    await this.db
      .update(hotelStaff)
      .set({ status: status as HotelStaffStatus, updatedAt: new Date() })
      .where(eq(hotelStaff.id, id));

    await this.audit.record({
      action: 'staff.status.changed',
      entity: 'hotel_staff',
      entityId: id,
      before: { status: existing.status },
      after: { status },
      reason,
    });

    return { id, status, previousStatus: existing.status };
  }

  /**
   * Force-sign-out a staff member from EVERY device, platform-wide. Reserved
   * for `staff.manage` — the same power that can block an account. Revokes all
   * live `staff_sessions` so the very next request on any device 401s.
   */
  async revokeAllSessions(id: string) {
    const [existing] = await this.db
      .select({ id: hotelStaff.id })
      .from(hotelStaff)
      .where(and(eq(hotelStaff.id, id), isNull(hotelStaff.deletedAt)))
      .limit(1);
    if (!existing) throw new NotFoundException('Staff member not found');

    const revoked = await this.db
      .update(staffSessions)
      .set({ revokedAt: new Date() })
      .where(and(eq(staffSessions.staffId, id), isNull(staffSessions.revokedAt)))
      .returning({ id: staffSessions.id });

    await this.audit.record({
      action: 'staff.sessions.revoked_all',
      entity: 'hotel_staff',
      entityId: id,
      after: { revoked: revoked.map((r) => r.id) },
    });

    return { id, revoked: revoked.length };
  }

  /** Exposed for reuse/testing — the values a filter may legitimately carry. */
  static readonly roles = hotelStaffRoleValues;
  static readonly statuses = hotelStaffStatusValues;
}
