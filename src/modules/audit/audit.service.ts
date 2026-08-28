import { Inject, Injectable } from '@nestjs/common';
import { desc, eq, and, SQL, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { auditLogs } from '../../database/schema';
import { getRequestContext } from '../../common/context/request-context';

export interface RecordAuditInput {
  action: string;
  entity?: string;
  entityId?: string;
  before?: unknown;
  after?: unknown;
  reason?: string;
  actorId?: string;
  actorEmail?: string;
  actorRole?: string;
}

@Injectable()
export class AuditService {
  constructor(@Inject(DRIZZLE) private readonly db: Database) {}

  async record(input: RecordAuditInput): Promise<void> {
    const ctx = getRequestContext();
    await this.db.insert(auditLogs).values({
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      before: input.before as never,
      after: input.after as never,
      reason: input.reason,
      actorId: input.actorId ?? ctx?.adminId,
      actorEmail: input.actorEmail ?? ctx?.adminEmail,
      actorRole: input.actorRole ?? ctx?.adminRole,
      ip: ctx?.ip,
      userAgent: ctx?.userAgent,
      requestId: ctx?.requestId,
    });
  }

  async list(params: {
    limit?: number;
    offset?: number;
    actorId?: string;
    entity?: string;
    entityId?: string;
  }) {
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;
    const conds: SQL[] = [];
    if (params.actorId) conds.push(eq(auditLogs.actorId, params.actorId));
    if (params.entity) conds.push(eq(auditLogs.entity, params.entity));
    if (params.entityId) conds.push(eq(auditLogs.entityId, params.entityId));
    const where = conds.length ? and(...conds) : undefined;

    const rows = await this.db
      .select()
      .from(auditLogs)
      .where(where)
      .orderBy(desc(auditLogs.createdAt))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(auditLogs)
      .where(where);

    return { rows, total: count, limit, offset };
  }
}
