import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { hotelStaff, incidents, type Incident } from '../../database/schema';
import { AssignIncidentDto, IncidentFilterDto, ReportIncidentDto, ResolveIncidentDto } from './dto';
import { SecurityErrors } from './security-errors';
import { assertIncidentTransition } from './security-rules';

const MAX_ROWS = 200;

/**
 * Incidents — reported by any guard, browsed/assigned/resolved by the manager.
 *
 * TENANT ISOLATION runs through every method: an incident is only ever resolved
 * by (id, propertyId = the caller's own). Cross-property 404s. The state machine
 * (OPEN → ASSIGNED → RESOLVED) lives in security-rules.ts.
 */
@Injectable()
export class IncidentsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  static toDto(i: Incident) {
    return {
      id: i.id,
      summary: i.summary,
      severity: i.severity,
      status: i.status,
      location: i.location,
      reportedBy: i.reportedBy,
      assignedTo: i.assignedTo,
      resolution: i.resolution,
      reportedAt: i.reportedAt,
      resolvedAt: i.resolvedAt,
      createdAt: i.createdAt,
      updatedAt: i.updatedAt,
    };
  }

  async require(propertyId: string, id: string): Promise<Incident> {
    const [row] = await this.db
      .select()
      .from(incidents)
      .where(and(eq(incidents.id, id), eq(incidents.propertyId, propertyId)))
      .limit(1);
    if (!row) throw SecurityErrors.incidentNotFound();
    return row;
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

  async list(propertyId: string, params: IncidentFilterDto) {
    const conds: SQL[] = [eq(incidents.propertyId, propertyId)];
    if (params.status) conds.push(eq(incidents.status, params.status));
    const rows = await this.db
      .select()
      .from(incidents)
      .where(and(...conds))
      .orderBy(desc(incidents.reportedAt))
      .limit(MAX_ROWS);
    return { items: rows.map(IncidentsService.toDto), total: rows.length };
  }

  async report(propertyId: string, dto: ReportIncidentDto, reportedBy: string | null) {
    const [row] = await this.db
      .insert(incidents)
      .values({
        propertyId,
        summary: dto.summary,
        severity: dto.severity,
        location: dto.location ?? null,
        reportedBy,
      })
      .returning();
    return IncidentsService.toDto(row);
  }

  async assign(propertyId: string, id: string, dto: AssignIncidentDto) {
    const before = await this.require(propertyId, id);
    await this.requireStaff(propertyId, dto.staffId);
    assertIncidentTransition(before.status, 'ASSIGNED');
    const [row] = await this.db
      .update(incidents)
      .set({ status: 'ASSIGNED', assignedTo: dto.staffId, updatedAt: new Date() })
      .where(and(eq(incidents.id, id), eq(incidents.propertyId, propertyId)))
      .returning();
    return { before, after: IncidentsService.toDto(row) };
  }

  async resolve(propertyId: string, id: string, dto: ResolveIncidentDto) {
    const before = await this.require(propertyId, id);
    assertIncidentTransition(before.status, 'RESOLVED');
    const [row] = await this.db
      .update(incidents)
      .set({
        status: 'RESOLVED',
        resolution: dto.resolution,
        resolvedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(and(eq(incidents.id, id), eq(incidents.propertyId, propertyId)))
      .returning();
    return { before, after: IncidentsService.toDto(row) };
  }
}
