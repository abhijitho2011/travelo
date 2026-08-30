import { Inject, Injectable } from '@nestjs/common';
import { and, asc, desc, eq, gte, lt, sql, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  hotelStaff,
  spaAppointments,
  type SpaAppointment,
  type SpaAppointmentStatus,
} from '../../database/schema';
import { AppointmentFilterDto, CreateAppointmentDto, UpdateAppointmentDto } from './dto';
import { SpaErrors } from './spa-errors';
import { assertAppointmentTransition } from './spa-rules';
import { SpaServicesService, type Tx } from './services.service';

const MAX_LIMIT = 200;

/**
 * Spa appointments — where a service and a therapist become a treatment.
 *
 * The rules that run through every method:
 *  1. TENANT ISOLATION. An appointment, a service, a therapist is only ever
 *     resolved by (id, propertyId = the caller's own). Cross-property 404s.
 *  2. PRICE + NAME SNAPSHOT. At booking the service's name and price are copied
 *     onto the appointment; the bill is computed from that snapshot, never the
 *     live service. Same rule as an order line snapshotting a menu item.
 *  3. ONE STATE MACHINE, in spa-rules.ts. Every status change goes through
 *     `assertAppointmentTransition`.
 *  4. OWN-ONLY for therapists. A spa staff member sees and acts on only the
 *     appointments assigned to them; the controller passes their id and the
 *     service enforces it.
 */
@Injectable()
export class SpaAppointmentsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly services: SpaServicesService,
  ) {}

  static toDto(a: SpaAppointment) {
    return {
      id: a.id,
      propertyId: a.propertyId,
      guestName: a.guestName,
      reservationId: a.reservationId,
      serviceId: a.serviceId,
      serviceName: a.serviceNameSnapshot,
      pricePaise: a.pricePaiseSnapshot,
      staffId: a.staffId,
      startAt: a.startAt,
      status: a.status,
      notes: a.notes,
      createdAt: a.createdAt,
      updatedAt: a.updatedAt,
      cancelledAt: a.cancelledAt,
      completedAt: a.completedAt,
    };
  }

  /** The single choke point for an appointment: (id, propertyId) or 404. */
  async requireAppointment(
    propertyId: string,
    id: string,
    tx: Tx = this.db,
  ): Promise<SpaAppointment> {
    const [row] = await tx
      .select()
      .from(spaAppointments)
      .where(and(eq(spaAppointments.id, id), eq(spaAppointments.propertyId, propertyId)))
      .limit(1);
    if (!row) throw SpaErrors.appointmentNotFound();
    return row;
  }

  /** A therapist may only touch their own appointment. */
  private assertOwned(a: SpaAppointment, myStaffId?: string) {
    if (myStaffId && a.staffId !== myStaffId) throw SpaErrors.appointmentNotFound();
  }

  private async requireTherapist(propertyId: string, staffId: string, tx: Tx = this.db) {
    const [row] = await tx
      .select({ id: hotelStaff.id })
      .from(hotelStaff)
      .where(and(eq(hotelStaff.id, staffId), eq(hotelStaff.propertyId, propertyId)))
      .limit(1);
    if (!row) throw SpaErrors.therapistNotFound();
    return row;
  }

  async list(propertyId: string, params: AppointmentFilterDto, myStaffId?: string) {
    const limit = Math.min(params.limit ?? 100, MAX_LIMIT);
    const offset = params.offset ?? 0;
    const conds: SQL[] = [eq(spaAppointments.propertyId, propertyId)];
    if (params.status) conds.push(eq(spaAppointments.status, params.status));
    if (myStaffId) conds.push(eq(spaAppointments.staffId, myStaffId));
    if (params.day) {
      const start = new Date(`${params.day}T00:00:00`);
      const end = new Date(start.getTime() + 24 * 60 * 60 * 1000);
      conds.push(gte(spaAppointments.startAt, start));
      conds.push(lt(spaAppointments.startAt, end));
    }
    const where = and(...conds);
    const rows = await this.db
      .select()
      .from(spaAppointments)
      .where(where)
      .orderBy(asc(spaAppointments.startAt))
      .limit(limit)
      .offset(offset);
    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(spaAppointments)
      .where(where);
    return { items: rows.map(SpaAppointmentsService.toDto), total: count, limit, offset };
  }

  async get(propertyId: string, id: string, myStaffId?: string) {
    const a = await this.requireAppointment(propertyId, id);
    this.assertOwned(a, myStaffId);
    return SpaAppointmentsService.toDto(a);
  }

  async create(propertyId: string, dto: CreateAppointmentDto) {
    return this.db.transaction(async (trx) => {
      const tx = trx as unknown as Tx;
      const service = await this.services.requireService(propertyId, dto.serviceId, tx);
      if (service.status !== 'ACTIVE' || service.deletedAt) {
        throw SpaErrors.serviceArchived(service.name);
      }
      if (dto.staffId) await this.requireTherapist(propertyId, dto.staffId, tx);
      const [created] = await tx
        .insert(spaAppointments)
        .values({
          propertyId,
          guestName: dto.guestName,
          reservationId: dto.reservationId ?? null,
          serviceId: service.id,
          staffId: dto.staffId ?? null,
          startAt: new Date(dto.startAt),
          // THE SNAPSHOT: name and price frozen at booking time.
          serviceNameSnapshot: service.name,
          pricePaiseSnapshot: service.pricePaise,
          notes: dto.notes ?? null,
        })
        .returning();
      return SpaAppointmentsService.toDto(created);
    });
  }

  async update(propertyId: string, id: string, dto: UpdateAppointmentDto) {
    const before = await this.requireAppointment(propertyId, id);
    if (before.status !== 'BOOKED')
      throw SpaErrors.invalidAppointmentTransition(before.status, before.status);
    const [row] = await this.db
      .update(spaAppointments)
      .set({
        guestName: dto.guestName ?? before.guestName,
        startAt: dto.startAt ? new Date(dto.startAt) : before.startAt,
        notes: dto.notes ?? before.notes,
        updatedAt: new Date(),
      })
      .where(and(eq(spaAppointments.id, id), eq(spaAppointments.propertyId, propertyId)))
      .returning();
    return { before, after: SpaAppointmentsService.toDto(row) };
  }

  async assignTherapist(propertyId: string, id: string, staffId: string) {
    const before = await this.requireAppointment(propertyId, id);
    await this.requireTherapist(propertyId, staffId);
    const [row] = await this.db
      .update(spaAppointments)
      .set({ staffId, updatedAt: new Date() })
      .where(and(eq(spaAppointments.id, id), eq(spaAppointments.propertyId, propertyId)))
      .returning();
    return { before, after: SpaAppointmentsService.toDto(row) };
  }

  /**
   * Advance an appointment through its state machine. `myStaffId`, when passed
   * (a spa therapist), restricts the move to their own appointment.
   */
  async setStatus(propertyId: string, id: string, to: SpaAppointmentStatus, myStaffId?: string) {
    return this.db.transaction(async (trx) => {
      const tx = trx as unknown as Tx;
      const before = await this.requireAppointment(propertyId, id, tx);
      this.assertOwned(before, myStaffId);
      assertAppointmentTransition(before.status, to);
      const [row] = await tx
        .update(spaAppointments)
        .set({
          status: to,
          cancelledAt: to === 'CANCELLED' ? new Date() : before.cancelledAt,
          completedAt: to === 'COMPLETED' ? new Date() : before.completedAt,
          updatedAt: new Date(),
        })
        .where(and(eq(spaAppointments.id, id), eq(spaAppointments.propertyId, propertyId)))
        .returning();
      return { before, after: SpaAppointmentsService.toDto(row) };
    });
  }

  async addNotes(propertyId: string, id: string, notes: string, myStaffId?: string) {
    const before = await this.requireAppointment(propertyId, id);
    this.assertOwned(before, myStaffId);
    const [row] = await this.db
      .update(spaAppointments)
      .set({ notes, updatedAt: new Date() })
      .where(and(eq(spaAppointments.id, id), eq(spaAppointments.propertyId, propertyId)))
      .returning();
    return { before, after: SpaAppointmentsService.toDto(row) };
  }

  /**
   * Manager dashboard, one call: today's appointments (by status), today's
   * completed-appointment count and the therapists on the roster with a count
   * of what each is assigned today.
   */
  async dashboard(propertyId: string, since: Date, until: Date) {
    const rows = await this.db
      .select()
      .from(spaAppointments)
      .where(
        and(
          eq(spaAppointments.propertyId, propertyId),
          gte(spaAppointments.startAt, since),
          lt(spaAppointments.startAt, until),
        ),
      )
      .orderBy(desc(spaAppointments.startAt));
    const byStatus: Record<string, number> = {};
    const byTherapist: Record<string, number> = {};
    let completed = 0;
    for (const r of rows) {
      byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
      if (r.status === 'COMPLETED') completed += 1;
      if (r.staffId) byTherapist[r.staffId] = (byTherapist[r.staffId] ?? 0) + 1;
    }
    return {
      todayCount: rows.length,
      completedCount: completed,
      byStatus,
      byTherapist,
      appointments: rows.map(SpaAppointmentsService.toDto),
    };
  }
}
