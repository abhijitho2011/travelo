import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, SQL, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  leads,
  salesActivities,
  leadStageValues,
  type Lead,
  type LeadStage,
  type SalesActivity,
  type SalesActivityType,
} from '../../database/schema';
import { CreateActivityDto, CreateLeadDto, LeadFilterDto, UpdateLeadDto } from './dto';
import { SalesErrors } from './sales-errors';
import { assertLeadTransition, OPEN_STAGES, WON_STAGES } from './sales-rules';

/** Any transaction handle or the pool itself. */
export type Tx = Pick<Database, 'select' | 'insert' | 'update' | 'delete'>;

/**
 * Sales CRM: leads and their activity timeline, per property. A foreign id 404s,
 * never 403.
 */
@Injectable()
export class LeadsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  static toDto(l: Lead) {
    return {
      id: l.id,
      propertyId: l.propertyId,
      name: l.name,
      company: l.company,
      contact: l.contact,
      source: l.source,
      stage: l.stage,
      valuePaise: l.valuePaise,
      ownerStaffId: l.ownerStaffId,
      notes: l.notes,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    };
  }

  static activityToDto(a: SalesActivity) {
    return {
      id: a.id,
      propertyId: a.propertyId,
      leadId: a.leadId,
      type: a.type,
      note: a.note,
      at: a.at,
      createdBy: a.createdBy,
      createdAt: a.createdAt,
    };
  }

  async requireLead(propertyId: string, id: string): Promise<Lead> {
    const [row] = await this.db
      .select()
      .from(leads)
      .where(and(eq(leads.id, id), eq(leads.propertyId, propertyId), isNull(leads.deletedAt)))
      .limit(1);
    if (!row) throw SalesErrors.leadNotFound();
    return row;
  }

  async list(propertyId: string, params: LeadFilterDto = {}) {
    const conds: SQL[] = [eq(leads.propertyId, propertyId), isNull(leads.deletedAt)];
    if (params.stage) conds.push(eq(leads.stage, params.stage));
    if (params.ownerStaffId) conds.push(eq(leads.ownerStaffId, params.ownerStaffId));
    const limit = Math.min(params.limit ?? 100, 500);
    const offset = params.offset ?? 0;

    const rows = await this.db
      .select()
      .from(leads)
      .where(and(...conds))
      .orderBy(desc(leads.updatedAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(leads)
      .where(and(...conds));

    return { items: rows.map(LeadsService.toDto), total: count, limit, offset };
  }

  /** The pipeline board: leads grouped by stage, in pipeline order. */
  async board(propertyId: string) {
    const rows = await this.db
      .select()
      .from(leads)
      .where(and(eq(leads.propertyId, propertyId), isNull(leads.deletedAt)))
      .orderBy(desc(leads.updatedAt));
    const columns = leadStageValues.map((stage) => ({
      stage,
      leads: rows.filter((r) => r.stage === stage).map(LeadsService.toDto),
    }));
    return { columns };
  }

  async get(propertyId: string, id: string) {
    const lead = await this.requireLead(propertyId, id);
    const activities = await this.db
      .select()
      .from(salesActivities)
      .where(and(eq(salesActivities.propertyId, propertyId), eq(salesActivities.leadId, id)))
      .orderBy(desc(salesActivities.at));
    return {
      ...LeadsService.toDto(lead),
      activities: activities.map(LeadsService.activityToDto),
    };
  }

  async create(propertyId: string, dto: CreateLeadDto) {
    const [row] = await this.db
      .insert(leads)
      .values({
        propertyId,
        name: dto.name.trim(),
        company: dto.company?.trim() || null,
        contact: dto.contact?.trim() || null,
        source: dto.source?.trim() || null,
        valuePaise: dto.valuePaise ?? 0,
        ownerStaffId: dto.ownerStaffId ?? null,
        notes: dto.notes?.trim() || null,
      })
      .returning();
    return LeadsService.toDto(row);
  }

  async update(propertyId: string, id: string, dto: UpdateLeadDto) {
    const before = await this.requireLead(propertyId, id);
    const patch: Partial<typeof leads.$inferInsert> = { updatedAt: new Date() };
    if (dto.name !== undefined) patch.name = dto.name.trim();
    if (dto.company !== undefined) patch.company = dto.company.trim() || null;
    if (dto.contact !== undefined) patch.contact = dto.contact.trim() || null;
    if (dto.source !== undefined) patch.source = dto.source.trim() || null;
    if (dto.valuePaise !== undefined) patch.valuePaise = dto.valuePaise;
    if (dto.ownerStaffId !== undefined) patch.ownerStaffId = dto.ownerStaffId;
    if (dto.notes !== undefined) patch.notes = dto.notes.trim() || null;

    const [after] = await this.db.update(leads).set(patch).where(eq(leads.id, id)).returning();
    return { before: LeadsService.toDto(before), after: LeadsService.toDto(after) };
  }

  /** Move a lead to a new stage, validated by the pipeline state machine. */
  async moveStage(propertyId: string, id: string, to: LeadStage) {
    const before = await this.requireLead(propertyId, id);
    assertLeadTransition(before.stage, to);
    const [after] = await this.db
      .update(leads)
      .set({ stage: to, updatedAt: new Date() })
      .where(eq(leads.id, id))
      .returning();
    return { before: LeadsService.toDto(before), after: LeadsService.toDto(after) };
  }

  async remove(propertyId: string, id: string) {
    const before = await this.requireLead(propertyId, id);
    await this.db
      .update(leads)
      .set({ deletedAt: new Date(), updatedAt: new Date() })
      .where(eq(leads.id, id));
    return { id, deleted: true, before: LeadsService.toDto(before) };
  }

  // ---------- Activities ----------

  async logActivity(propertyId: string, leadId: string, dto: CreateActivityDto, createdBy: string) {
    await this.requireLead(propertyId, leadId);
    const [row] = await this.db
      .insert(salesActivities)
      .values({
        propertyId,
        leadId,
        type: dto.type as SalesActivityType,
        note: dto.note?.trim() || null,
        at: dto.at ? new Date(dto.at) : new Date(),
        createdBy,
      })
      .returning();
    // Touch the lead so the board re-sorts it to the top.
    await this.db.update(leads).set({ updatedAt: new Date() }).where(eq(leads.id, leadId));
    return LeadsService.activityToDto(row);
  }

  async listActivities(propertyId: string, leadId: string) {
    await this.requireLead(propertyId, leadId);
    const rows = await this.db
      .select()
      .from(salesActivities)
      .where(and(eq(salesActivities.propertyId, propertyId), eq(salesActivities.leadId, leadId)))
      .orderBy(desc(salesActivities.at));
    return rows.map(LeadsService.activityToDto);
  }

  // ---------- Dashboard ----------

  async summary(propertyId: string) {
    const rows = await this.db
      .select({
        stage: leads.stage,
        count: sql<number>`count(*)::int`,
        valuePaise: sql<number>`coalesce(sum(${leads.valuePaise}), 0)::int`,
      })
      .from(leads)
      .where(and(eq(leads.propertyId, propertyId), isNull(leads.deletedAt)))
      .groupBy(leads.stage);

    const byStage = leadStageValues.map((stage) => {
      const found = rows.find((r) => r.stage === stage);
      return { stage, count: found?.count ?? 0, valuePaise: found?.valuePaise ?? 0 };
    });

    const total = rows.reduce((s, r) => s + r.count, 0);
    const won = rows
      .filter((r) => WON_STAGES.includes(r.stage as LeadStage))
      .reduce((s, r) => s + r.count, 0);
    const open = rows
      .filter((r) => OPEN_STAGES.includes(r.stage as LeadStage))
      .reduce((s, r) => s + r.count, 0);
    const openValuePaise = rows
      .filter((r) => OPEN_STAGES.includes(r.stage as LeadStage))
      .reduce((s, r) => s + r.valuePaise, 0);
    const wonValuePaise = rows
      .filter((r) => WON_STAGES.includes(r.stage as LeadStage))
      .reduce((s, r) => s + r.valuePaise, 0);

    return {
      byStage,
      totalLeads: total,
      openLeads: open,
      wonLeads: won,
      // Conversion = won / (all closed+open) as a whole-number percent.
      conversionPercent: total > 0 ? Math.round((won / total) * 100) : 0,
      openValuePaise,
      wonValuePaise,
    };
  }
}
