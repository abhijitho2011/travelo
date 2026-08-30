import { Inject, Injectable } from '@nestjs/common';
import { and, asc, eq, gte, isNull, lt, SQL, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  hotelStaff,
  transportRequests,
  vehicles,
  type DriverStage,
  type TransportRequest,
  type TransportStatus,
  type TransportType,
} from '../../database/schema';
import { CreateTransportDto, TransportFilterDto, UpdateTransportDto } from './dto';
import { TransportErrors } from './transport-errors';
import {
  assertDriverStage,
  assertTransportTransition,
  driverStepStage,
  type DriverStep,
} from './transport-rules';

export type Tx = Pick<Database, 'select' | 'insert' | 'update' | 'delete'>;

/**
 * Transport requests, per property — the core shared by the Travel Desk (which
 * creates, assigns and cancels) and the Driver (who drives the trip through its
 * doorstep steps). A foreign id 404s, never 403; a driver acting on a trip that
 * is not theirs gets the same 404.
 */
@Injectable()
export class TransportService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  static toDto(
    r: TransportRequest,
    extra?: { driverName?: string | null; vehicleName?: string | null },
  ) {
    return {
      id: r.id,
      propertyId: r.propertyId,
      guestName: r.guestName,
      reservationId: r.reservationId,
      type: r.type,
      pickupAt: r.pickupAt,
      fromLocation: r.fromLocation,
      toLocation: r.toLocation,
      vehicleId: r.vehicleId,
      vehicleName: extra?.vehicleName ?? null,
      driverStaffId: r.driverStaffId,
      driverName: extra?.driverName ?? null,
      status: r.status,
      driverStage: r.driverStage,
      farePaise: r.farePaise,
      note: r.note,
      createdBy: r.createdBy,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    };
  }

  async requireRequest(
    propertyId: string,
    id: string,
    tx: Tx = this.db,
  ): Promise<TransportRequest> {
    const [row] = await tx
      .select()
      .from(transportRequests)
      .where(
        and(
          eq(transportRequests.id, id),
          eq(transportRequests.propertyId, propertyId),
          isNull(transportRequests.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw TransportErrors.requestNotFound();
    return row;
  }

  /** Join driver + vehicle names for display. */
  private async hydrate(r: TransportRequest) {
    let driverName: string | null = null;
    let vehicleName: string | null = null;
    if (r.driverStaffId) {
      const [d] = await this.db
        .select({ firstName: hotelStaff.firstName, lastName: hotelStaff.lastName })
        .from(hotelStaff)
        .where(eq(hotelStaff.id, r.driverStaffId))
        .limit(1);
      if (d) driverName = `${d.firstName} ${d.lastName}`.trim();
    }
    if (r.vehicleId) {
      const [v] = await this.db
        .select({ name: vehicles.name, plate: vehicles.plate })
        .from(vehicles)
        .where(eq(vehicles.id, r.vehicleId))
        .limit(1);
      if (v) vehicleName = `${v.name} (${v.plate})`;
    }
    return TransportService.toDto(r, { driverName, vehicleName });
  }

  private static dayWindow(iso?: string): { start: Date; end: Date } {
    const base = iso ? new Date(iso) : new Date();
    const start = new Date(base);
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start, end };
  }

  async list(propertyId: string, params: TransportFilterDto = {}) {
    const conds: SQL[] = [
      eq(transportRequests.propertyId, propertyId),
      isNull(transportRequests.deletedAt),
    ];
    if (params.status) conds.push(eq(transportRequests.status, params.status));
    if (params.type) conds.push(eq(transportRequests.type, params.type));
    if (params.date) {
      const { start, end } = TransportService.dayWindow(params.date);
      conds.push(gte(transportRequests.pickupAt, start));
      conds.push(lt(transportRequests.pickupAt, end));
    }
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;

    const rows = await this.db
      .select()
      .from(transportRequests)
      .where(and(...conds))
      .orderBy(asc(transportRequests.pickupAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(transportRequests)
      .where(and(...conds));

    const items = await Promise.all(rows.map((r) => this.hydrate(r)));
    return { items, total: count, limit, offset };
  }

  async get(propertyId: string, id: string) {
    return this.hydrate(await this.requireRequest(propertyId, id));
  }

  async summary(propertyId: string) {
    const { start, end } = TransportService.dayWindow();
    const [today] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(transportRequests)
      .where(
        and(
          eq(transportRequests.propertyId, propertyId),
          isNull(transportRequests.deletedAt),
          gte(transportRequests.pickupAt, start),
          lt(transportRequests.pickupAt, end),
        ),
      );
    const [pending] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(transportRequests)
      .where(
        and(
          eq(transportRequests.propertyId, propertyId),
          isNull(transportRequests.deletedAt),
          eq(transportRequests.status, 'REQUESTED'),
        ),
      );
    const [inProgress] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(transportRequests)
      .where(
        and(
          eq(transportRequests.propertyId, propertyId),
          isNull(transportRequests.deletedAt),
          eq(transportRequests.status, 'IN_PROGRESS'),
        ),
      );
    return {
      todayCount: today?.count ?? 0,
      pendingCount: pending?.count ?? 0,
      inProgressCount: inProgress?.count ?? 0,
    };
  }

  async create(propertyId: string, dto: CreateTransportDto, createdBy: string) {
    const [row] = await this.db
      .insert(transportRequests)
      .values({
        propertyId,
        guestName: dto.guestName.trim(),
        reservationId: dto.reservationId ?? null,
        type: dto.type as TransportType,
        pickupAt: new Date(dto.pickupAt),
        fromLocation: dto.fromLocation?.trim() || null,
        toLocation: dto.toLocation?.trim() || null,
        farePaise: dto.farePaise ?? null,
        note: dto.note?.trim() || null,
        createdBy,
      })
      .returning();
    return this.hydrate(row);
  }

  async update(propertyId: string, id: string, dto: UpdateTransportDto) {
    const before = await this.requireRequest(propertyId, id);
    const patch: Partial<typeof transportRequests.$inferInsert> = { updatedAt: new Date() };
    if (dto.guestName !== undefined) patch.guestName = dto.guestName.trim();
    if (dto.reservationId !== undefined) patch.reservationId = dto.reservationId;
    if (dto.type !== undefined) patch.type = dto.type as TransportType;
    if (dto.pickupAt !== undefined) patch.pickupAt = new Date(dto.pickupAt);
    if (dto.fromLocation !== undefined) patch.fromLocation = dto.fromLocation.trim() || null;
    if (dto.toLocation !== undefined) patch.toLocation = dto.toLocation.trim() || null;
    if (dto.farePaise !== undefined) patch.farePaise = dto.farePaise;
    if (dto.note !== undefined) patch.note = dto.note.trim() || null;

    await this.db.update(transportRequests).set(patch).where(eq(transportRequests.id, id));
    const after = await this.requireRequest(propertyId, id);
    return { before: TransportService.toDto(before), after: await this.hydrate(after) };
  }

  /** Validate a staff id belongs to this property (tenant isolation on assign). */
  private async assertStaffInProperty(propertyId: string, staffId: string): Promise<void> {
    const [row] = await this.db
      .select({ id: hotelStaff.id })
      .from(hotelStaff)
      .where(
        and(
          eq(hotelStaff.id, staffId),
          eq(hotelStaff.propertyId, propertyId),
          isNull(hotelStaff.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw TransportErrors.driverRequired();
  }

  async assign(propertyId: string, id: string, driverStaffId: string, vehicleId?: string) {
    const before = await this.requireRequest(propertyId, id);
    if (before.status !== 'REQUESTED' && before.status !== 'ASSIGNED')
      throw TransportErrors.notAssignable();
    assertTransportTransition(before.status, 'ASSIGNED');
    await this.assertStaffInProperty(propertyId, driverStaffId);
    if (vehicleId) {
      const [v] = await this.db
        .select({ id: vehicles.id })
        .from(vehicles)
        .where(
          and(
            eq(vehicles.id, vehicleId),
            eq(vehicles.propertyId, propertyId),
            isNull(vehicles.deletedAt),
          ),
        )
        .limit(1);
      if (!v) throw TransportErrors.vehicleNotFound();
    }
    await this.db
      .update(transportRequests)
      .set({
        status: 'ASSIGNED',
        driverStaffId,
        vehicleId: vehicleId ?? null,
        updatedAt: new Date(),
      })
      .where(eq(transportRequests.id, id));
    const after = await this.requireRequest(propertyId, id);
    return { before: TransportService.toDto(before), after: await this.hydrate(after) };
  }

  /** Desk-driven status moves: cancel, unassign (→ REQUESTED) and complete. */
  async setStatus(propertyId: string, id: string, to: TransportStatus) {
    const before = await this.requireRequest(propertyId, id);
    assertTransportTransition(before.status, to);
    const patch: Partial<typeof transportRequests.$inferInsert> = {
      status: to,
      updatedAt: new Date(),
    };
    // Unassigning clears the driver, the vehicle and any driver progress.
    if (to === 'REQUESTED') {
      patch.driverStaffId = null;
      patch.vehicleId = null;
      patch.driverStage = null;
    }
    await this.db.update(transportRequests).set(patch).where(eq(transportRequests.id, id));
    const after = await this.requireRequest(propertyId, id);
    return { before: TransportService.toDto(before), after: await this.hydrate(after) };
  }

  async remove(propertyId: string, id: string) {
    const before = await this.requireRequest(propertyId, id);
    await this.db
      .update(transportRequests)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(transportRequests.id, id));
    return { id, deleted: true, before: TransportService.toDto(before) };
  }

  // ================= Driver-facing =================

  /** Trips assigned to this driver — active first, then recent history. */
  async myTrips(propertyId: string, driverStaffId: string) {
    const rows = await this.db
      .select()
      .from(transportRequests)
      .where(
        and(
          eq(transportRequests.propertyId, propertyId),
          eq(transportRequests.driverStaffId, driverStaffId),
          isNull(transportRequests.deletedAt),
        ),
      )
      .orderBy(
        // Active trips (ASSIGNED, IN_PROGRESS) surface above closed ones.
        sql`case when ${transportRequests.status} in ('ASSIGNED','IN_PROGRESS') then 0 else 1 end`,
        asc(transportRequests.pickupAt),
      );
    return Promise.all(rows.map((r) => this.hydrate(r)));
  }

  /** A single trip that MUST belong to this driver, else 404. */
  async requireMyTrip(
    propertyId: string,
    driverStaffId: string,
    id: string,
    tx: Tx = this.db,
  ): Promise<TransportRequest> {
    const [row] = await tx
      .select()
      .from(transportRequests)
      .where(
        and(
          eq(transportRequests.id, id),
          eq(transportRequests.propertyId, propertyId),
          eq(transportRequests.driverStaffId, driverStaffId),
          isNull(transportRequests.deletedAt),
        ),
      )
      .limit(1);
    if (!row) throw TransportErrors.notYourTrip();
    return row;
  }

  async getMyTrip(propertyId: string, driverStaffId: string, id: string) {
    return this.hydrate(await this.requireMyTrip(propertyId, driverStaffId, id));
  }

  /**
   * Advance a trip the driver owns through its doorstep steps. `accept` moves
   * the request ASSIGNED → IN_PROGRESS and sets stage ACCEPTED; the middle steps
   * walk the driver-stage machine; `complete` moves IN_PROGRESS → COMPLETED and
   * requires the guest to have been PICKED_UP. All in one transaction.
   */
  async step(propertyId: string, driverStaffId: string, id: string, step: DriverStep) {
    return this.db.transaction(async (trx) => {
      const tx = trx as unknown as Tx;
      const before = await this.requireMyTrip(propertyId, driverStaffId, id, tx);

      const patch: Partial<typeof transportRequests.$inferInsert> = { updatedAt: new Date() };

      if (step === 'accept') {
        assertTransportTransition(before.status, 'IN_PROGRESS');
        assertDriverStage(before.driverStage ?? null, 'ACCEPTED');
        patch.status = 'IN_PROGRESS';
        patch.driverStage = 'ACCEPTED';
      } else if (step === 'complete') {
        assertTransportTransition(before.status, 'COMPLETED');
        if (before.driverStage !== 'PICKED_UP')
          throw TransportErrors.invalidDriverStep(before.driverStage ?? 'ASSIGNED', 'PICKED_UP');
        patch.status = 'COMPLETED';
      } else {
        const to = driverStepStage(step) as DriverStage;
        if (before.status !== 'IN_PROGRESS')
          throw TransportErrors.invalidDriverStep(before.status, to);
        assertDriverStage(before.driverStage ?? null, to);
        patch.driverStage = to;
      }

      await tx.update(transportRequests).set(patch).where(eq(transportRequests.id, id));
      const after = await this.requireMyTrip(propertyId, driverStaffId, id, tx);
      return {
        before: TransportService.toDto(before),
        after: TransportService.toDto(after),
      };
    });
  }
}
