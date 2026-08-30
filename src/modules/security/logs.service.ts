import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, SQL } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  gateMovements,
  lostFoundItems,
  visitorLogs,
  type GateMovement,
  type LostFoundItem,
  type LostFoundStatus,
  type VisitorLog,
} from '../../database/schema';
import { RecordGateMovementDto, RecordLostFoundDto, RecordVisitorDto } from './dto';
import { SecurityErrors } from './security-errors';

const MAX_ROWS = 200;

/**
 * The guard's ledgers: the gate feed, the visitor book and lost-&-found. These
 * are the tables the already-shipped security STAFF screens write; until now
 * they had no backend and degraded to empty. Everything is PROPERTY-SCOPED — a
 * foreign id 404s — and nothing here touches money.
 */
@Injectable()
export class SecurityLogsService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  // ---------- Gate log ----------

  static gateToDto(g: GateMovement) {
    return {
      id: g.id,
      movement: g.movement,
      subject: g.subject,
      detail: g.detail,
      recordedBy: g.recordedBy,
      at: g.createdAt,
      createdAt: g.createdAt,
    };
  }

  async gateLog(propertyId: string, kind?: string) {
    const conds: SQL[] = [eq(gateMovements.propertyId, propertyId)];
    // The app's vehicle screen passes kind=vehicle; the feed is one table.
    const rows = await this.db
      .select()
      .from(gateMovements)
      .where(and(...conds))
      .orderBy(desc(gateMovements.createdAt))
      .limit(MAX_ROWS);
    const filtered =
      kind === 'vehicle' ? rows.filter((r) => r.movement.startsWith('VEHICLE')) : rows;
    return { items: filtered.map(SecurityLogsService.gateToDto), total: filtered.length };
  }

  async recordGate(propertyId: string, dto: RecordGateMovementDto, recordedBy: string | null) {
    const [row] = await this.db
      .insert(gateMovements)
      .values({
        propertyId,
        movement: dto.movement,
        subject: dto.subject,
        detail: dto.detail ?? null,
        recordedBy,
      })
      .returning();
    return SecurityLogsService.gateToDto(row);
  }

  // ---------- Visitors ----------

  static visitorToDto(v: VisitorLog) {
    return {
      id: v.id,
      name: v.name,
      visiting: v.visiting,
      purpose: v.purpose,
      passNumber: v.passNumber,
      recordedBy: v.recordedBy,
      arrivedAt: v.arrivedAt,
      departedAt: v.departedAt,
      onSite: v.departedAt === null,
    };
  }

  async visitors(propertyId: string, onSiteOnly = false) {
    const conds: SQL[] = [eq(visitorLogs.propertyId, propertyId)];
    if (onSiteOnly) conds.push(isNull(visitorLogs.departedAt));
    const rows = await this.db
      .select()
      .from(visitorLogs)
      .where(and(...conds))
      .orderBy(desc(visitorLogs.arrivedAt))
      .limit(MAX_ROWS);
    return { items: rows.map(SecurityLogsService.visitorToDto), total: rows.length };
  }

  async recordVisitor(propertyId: string, dto: RecordVisitorDto, recordedBy: string | null) {
    const [row] = await this.db
      .insert(visitorLogs)
      .values({
        propertyId,
        name: dto.name,
        visiting: dto.visiting ?? null,
        purpose: dto.purpose ?? null,
        passNumber: dto.passNumber ?? null,
        recordedBy,
      })
      .returning();
    return SecurityLogsService.visitorToDto(row);
  }

  async departVisitor(propertyId: string, id: string) {
    const [existing] = await this.db
      .select()
      .from(visitorLogs)
      .where(and(eq(visitorLogs.id, id), eq(visitorLogs.propertyId, propertyId)))
      .limit(1);
    if (!existing) throw SecurityErrors.visitorNotFound();
    if (existing.departedAt) throw SecurityErrors.visitorAlreadyDeparted();
    const [row] = await this.db
      .update(visitorLogs)
      .set({ departedAt: new Date() })
      .where(and(eq(visitorLogs.id, id), eq(visitorLogs.propertyId, propertyId)))
      .returning();
    return SecurityLogsService.visitorToDto(row);
  }

  // ---------- Lost & found ----------

  static lostFoundToDto(l: LostFoundItem) {
    return {
      id: l.id,
      description: l.description,
      location: l.location,
      status: l.status,
      recordedBy: l.recordedBy,
      foundAt: l.foundAt,
      createdAt: l.createdAt,
    };
  }

  async lostFound(propertyId: string) {
    const rows = await this.db
      .select()
      .from(lostFoundItems)
      .where(eq(lostFoundItems.propertyId, propertyId))
      .orderBy(desc(lostFoundItems.foundAt))
      .limit(MAX_ROWS);
    return { items: rows.map(SecurityLogsService.lostFoundToDto), total: rows.length };
  }

  async recordLostFound(propertyId: string, dto: RecordLostFoundDto, recordedBy: string | null) {
    const [row] = await this.db
      .insert(lostFoundItems)
      .values({
        propertyId,
        description: dto.description,
        location: dto.location ?? null,
        recordedBy,
      })
      .returning();
    return SecurityLogsService.lostFoundToDto(row);
  }

  async updateLostFound(propertyId: string, id: string, status: LostFoundStatus) {
    const [existing] = await this.db
      .select({ id: lostFoundItems.id })
      .from(lostFoundItems)
      .where(and(eq(lostFoundItems.id, id), eq(lostFoundItems.propertyId, propertyId)))
      .limit(1);
    if (!existing) throw SecurityErrors.lostFoundNotFound();
    const [row] = await this.db
      .update(lostFoundItems)
      .set({ status })
      .where(and(eq(lostFoundItems.id, id), eq(lostFoundItems.propertyId, propertyId)))
      .returning();
    return SecurityLogsService.lostFoundToDto(row);
  }
}
