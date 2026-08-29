import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, ilike, inArray, isNull, or, sql, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { hotelStaff, properties, type HotelStaffRole, type HotelStaffStatus } from '../../database/schema';
import { NotificationDeliveryService } from '../notifications/notification-delivery.service';
import { inAppRecipient } from '../notifications/channels/channel.interface';
import { AuthenticatedStaff } from './current-staff.decorator';
import { StaffErrors } from './staff-errors';
import { CreateTeamMemberDto, StaffTeamFilterDto } from './dto';
import { ROLE_NARROWED_ACTORS, creatableRolesFor } from './role-creation';

const MAX_LIMIT = 100;

/**
 * GM/AGM team management, scoped to ONE property.
 *
 * Two rules hold for every method here:
 *  1. Tenant isolation — a target row is only ever resolved by
 *     `(id, propertyId = the caller's own propertyId, deletedAt IS NULL)`. A
 *     row at another property is indistinguishable from a row that does not
 *     exist: both 404. A 403 would confirm the row is real and leak which
 *     property it sits at.
 *  2. No self-service — nobody may approve, re-status or delete their own row,
 *     so a suspended-pending manager cannot rescue themselves and no one can
 *     escalate by editing their own record. Role is not editable at all through
 *     this surface; the only place a role is chosen is on creation, from the
 *     per-actor whitelist in `creatableRolesFor` — which excludes GM and AGM
 *     for everyone, and excludes HR for HR.
 */
@Injectable()
export class StaffTeamService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly notifications: NotificationDeliveryService,
  ) {}

  /** Every filter clause is AND-ed onto the caller's own property. */
  static conditions(propertyId: string, params: StaffTeamFilterDto): SQL[] {
    const conds: SQL[] = [eq(hotelStaff.propertyId, propertyId), isNull(hotelStaff.deletedAt)];
    if (params.role) conds.push(eq(hotelStaff.role, params.role as HotelStaffRole));
    if (params.status) conds.push(eq(hotelStaff.status, params.status as HotelStaffStatus));
    if (params.department) conds.push(ilike(hotelStaff.department, params.department));
    if (params.q) {
      const term = `%${params.q}%`;
      conds.push(
        or(
          ilike(hotelStaff.firstName, term),
          ilike(hotelStaff.lastName, term),
          ilike(sql`${hotelStaff.firstName} || ' ' || ${hotelStaff.lastName}`, term),
          ilike(hotelStaff.email, term),
        ) as SQL,
      );
    }
    return conds;
  }

  async list(me: AuthenticatedStaff, params: StaffTeamFilterDto) {
    const limit = Math.min(params.limit ?? 50, MAX_LIMIT);
    const offset = params.offset ?? 0;
    const where = and(...StaffTeamService.conditions(me.propertyId, params));

    const rows = await this.db
      .select()
      .from(hotelStaff)
      .where(where)
      .orderBy(desc(hotelStaff.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(hotelStaff)
      .where(where);

    return { items: rows.map((r) => this.toDto(r)), total: count, limit, offset };
  }

  async create(me: AuthenticatedStaff, dto: CreateTeamMemberDto) {
    // Defence in depth: the DTO whitelists the property-wide set, but the
    // per-actor set is narrower and is the one that decides. `creatableRolesFor`
    // is the single tested authority — no conditionals on role live here.
    if (!(creatableRolesFor(me.role) as readonly string[]).includes(dto.role)) {
      throw ROLE_NARROWED_ACTORS.has(me.role)
        ? StaffErrors.roleNotPermitted()
        : StaffErrors.roleNotAssignable();
    }

    // New team members wait for approval unless the creator can approve, in
    // which case they may opt to activate immediately.
    //
    // This is what makes HR's accounts always PENDING_APPROVAL: HR holds
    // `staff.create` but NOT `staff.approve`, and `me.permissions` is resolved
    // server-side from the DB role on every request (see StaffJwtGuard), so an
    // `activate: true` in the body is simply inert for them.
    const canApprove = me.permissions.includes('staff.approve');
    const status: HotelStaffStatus = canApprove && dto.activate ? 'ACTIVE' : 'PENDING_APPROVAL';

    const [row] = await this.db
      .insert(hotelStaff)
      .values({
        // Always the creator's own property and organisation — never a value
        // the client supplied.
        propertyId: me.propertyId,
        ownerId: me.ownerId,
        role: dto.role as HotelStaffRole,
        firstName: dto.firstName,
        lastName: dto.lastName,
        email: dto.email.toLowerCase(),
        mobile: dto.mobile,
        department: dto.department,
        employeeId: dto.employeeId,
        address: dto.address,
        pinCode: dto.pinCode,
        state: dto.state,
        district: dto.district,
        status,
      })
      .returning();
    // Post-write, best-effort: an unheard notification must never undo a hire.
    if (row.status === 'PENDING_APPROVAL') await this.announcePending(row);
    return this.toDto(row);
  }

  async approve(me: AuthenticatedStaff, staffId: string) {
    const target = await this.requireTeamMember(me, staffId);
    if (target.status !== 'PENDING_APPROVAL' && target.status !== 'APPROVED') {
      throw StaffErrors.forbidden(`Cannot approve a member in status ${target.status}`);
    }
    await this.db
      .update(hotelStaff)
      .set({ status: 'ACTIVE', updatedAt: new Date() })
      .where(eq(hotelStaff.id, staffId));
    await this.announceApproved(target);
    return { id: staffId, status: 'ACTIVE' };
  }

  async setStatus(me: AuthenticatedStaff, staffId: string, status: string) {
    // ACTIVE is the approval outcome, so it needs the approval permission no
    // matter which endpoint asks for it. `staff.update` buys the restrictive
    // moves — block, suspend, deactivate — and nothing that puts somebody into
    // service. This is what stops HR from raising a row and then activating it
    // itself, which would make the whole pending state decorative.
    if (status === 'ACTIVE' && !me.permissions.includes('staff.approve')) {
      throw StaffErrors.activationRequiresApproval();
    }
    await this.requireTeamMember(me, staffId);
    await this.db
      .update(hotelStaff)
      .set({ status: status as HotelStaffStatus, updatedAt: new Date() })
      .where(eq(hotelStaff.id, staffId));
    return { id: staffId, status };
  }

  async remove(me: AuthenticatedStaff, staffId: string) {
    await this.requireTeamMember(me, staffId);
    const now = new Date();
    await this.db
      .update(hotelStaff)
      .set({ deletedAt: now, updatedAt: now })
      .where(eq(hotelStaff.id, staffId));
    return { id: staffId, deleted: true };
  }

  private async propertyName(propertyId: string): Promise<string> {
    const [p] = await this.db
      .select({ name: properties.name })
      .from(properties)
      .where(eq(properties.id, propertyId))
      .limit(1);
    return p?.name ?? 'your property';
  }

  /** In-app to whoever can approve at this property — the GM and the AGM. */
  private async announcePending(row: typeof hotelStaff.$inferSelect): Promise<void> {
    const approvers = await this.db
      .select({ id: hotelStaff.id })
      .from(hotelStaff)
      .where(
        and(
          eq(hotelStaff.propertyId, row.propertyId),
          inArray(hotelStaff.role, [
            'GENERAL_MANAGER',
            'ASSISTANT_GENERAL_MANAGER',
          ] as HotelStaffRole[]),
          eq(hotelStaff.status, 'ACTIVE'),
          isNull(hotelStaff.deletedAt),
        ),
      );
    const vars = {
      staffName: `${row.firstName} ${row.lastName}`.trim(),
      role: row.role,
      propertyName: await this.propertyName(row.propertyId),
    };
    for (const approver of approvers) {
      await this.notifications.notifyQuietly({
        key: 'staff.pending_approval',
        relatedType: 'hotel_staff',
        relatedId: row.id,
        targets: [{ channel: 'IN_APP', to: inAppRecipient('staff', approver.id) }],
        vars,
      });
    }
  }

  /** SMS + email to the staff member whose account just went live. */
  private async announceApproved(row: typeof hotelStaff.$inferSelect): Promise<void> {
    await this.notifications.notifyQuietly({
      key: 'staff.approved',
      relatedType: 'hotel_staff',
      relatedId: row.id,
      targets: [
        { channel: 'SMS', to: row.mobile ?? '' },
        { channel: 'EMAIL', to: row.email ?? '' },
        { channel: 'IN_APP', to: inAppRecipient('staff', row.id) },
      ],
      vars: {
        staffName: `${row.firstName} ${row.lastName}`.trim(),
        role: row.role,
        propertyName: await this.propertyName(row.propertyId),
      },
    });
  }

  /**
   * The single choke point for every mutation: resolves the target inside the
   * caller's property or 404s, and refuses self-targeting.
   */
  private async requireTeamMember(me: AuthenticatedStaff, staffId: string) {
    if (staffId === me.id) throw StaffErrors.selfModification();
    const [row] = await this.db
      .select()
      .from(hotelStaff)
      .where(
        and(
          eq(hotelStaff.id, staffId),
          eq(hotelStaff.propertyId, me.propertyId),
          isNull(hotelStaff.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw StaffErrors.notFound('Staff member not found');
    return row;
  }

  private toDto(r: typeof hotelStaff.$inferSelect) {
    return {
      id: r.id,
      firstName: r.firstName,
      lastName: r.lastName,
      fullName: `${r.firstName} ${r.lastName}`.trim(),
      email: r.email,
      mobile: r.mobile,
      role: r.role,
      status: r.status,
      department: r.department,
      employeeId: r.employeeId,
      state: r.state,
      district: r.district,
      pinCode: r.pinCode,
      lastLoginAt: r.lastLoginAt,
      createdAt: r.createdAt,
    };
  }
}
