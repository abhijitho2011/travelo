import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { and, desc, eq } from 'drizzle-orm';
import { v4 as uuid } from 'uuid';
import { DRIZZLE, Database } from '../../database/database.module';
import { impersonationSessions } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { getRequestContext } from '../../common/context/request-context';
import {
  IMPERSONATION_AUDIENCE,
  IMPERSONATION_ISSUER,
  IMPERSONATION_TTL_SECONDS,
} from './impersonation.constants';

export interface StartImpersonationInput {
  actorAdminId: string;
  targetUserType: 'OWNER' | 'GM' | 'AGM';
  targetUserId?: string;
  targetOwnerId?: string;
  targetPropertyId?: string;
  reason: string;
}

@Injectable()
export class ImpersonationService {
  static IMPERSONATION_ISSUER = IMPERSONATION_ISSUER;
  static IMPERSONATION_AUDIENCE = IMPERSONATION_AUDIENCE;
  static IMPERSONATION_TTL_SECONDS = IMPERSONATION_TTL_SECONDS;

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

  async start(input: StartImpersonationInput, audit: AuditService) {
    const ctx = getRequestContext();
    const jti = uuid();
    // For an OWNER session the owner id IS the target user id. Callers pass one
    // or the other; store both so the owner API can resolve the subject without
    // having to know which field the console happened to fill in.
    const targetUserId =
      input.targetUserId ?? (input.targetUserType === 'OWNER' ? input.targetOwnerId : undefined);
    const targetOwnerId =
      input.targetOwnerId ?? (input.targetUserType === 'OWNER' ? input.targetUserId : undefined);
    const [row] = await this.db
      .insert(impersonationSessions)
      .values({
        actorAdminId: input.actorAdminId,
        targetUserType: input.targetUserType,
        targetUserId,
        targetOwnerId,
        targetPropertyId: input.targetPropertyId,
        reason: input.reason,
        ip: ctx?.ip,
        userAgent: ctx?.userAgent,
        tokenJti: jti,
      })
      .returning();

    const token = await this.issueToken({
      sessionId: row.id,
      actorAdminId: input.actorAdminId,
      targetUserId,
      jti,
    });

    await audit.record({
      action: 'impersonation.started',
      entity: 'impersonation',
      entityId: row.id,
      after: {
        actorAdminId: input.actorAdminId,
        targetUserType: input.targetUserType,
        targetUserId: input.targetUserId,
      },
      reason: input.reason,
    });
    return {
      session: row,
      token,
      expiresInSeconds: ImpersonationService.IMPERSONATION_TTL_SECONDS,
    };
  }

  async issueToken(payload: {
    sessionId: string;
    actorAdminId: string;
    targetUserId?: string;
    jti: string;
  }): Promise<string> {
    return this.jwt.signAsync(
      {
        actorAdminId: payload.actorAdminId,
        targetUserId: payload.targetUserId,
        sessionId: payload.sessionId,
      },
      {
        secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
        issuer: IMPERSONATION_ISSUER,
        audience: IMPERSONATION_AUDIENCE,
        jwtid: payload.jti,
        expiresIn: `${IMPERSONATION_TTL_SECONDS}s`,
      },
    );
  }

  async get(id: string) {
    const [row] = await this.db
      .select()
      .from(impersonationSessions)
      .where(eq(impersonationSessions.id, id))
      .limit(1);
    if (!row) throw new NotFoundException('Session not found');
    return row;
  }

  async terminate(id: string, audit: AuditService) {
    const row = await this.get(id);
    await this.db
      .update(impersonationSessions)
      .set({ endedAt: new Date(), status: 'TERMINATED' })
      .where(eq(impersonationSessions.id, id));
    await audit.record({
      action: 'impersonation.terminated',
      entity: 'impersonation',
      entityId: id,
      before: row,
    });
    return this.get(id);
  }

  async history(params: { limit?: number; offset?: number; actorAdminId?: string }) {
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;
    const where = params.actorAdminId
      ? eq(impersonationSessions.actorAdminId, params.actorAdminId)
      : undefined;
    return this.db
      .select()
      .from(impersonationSessions)
      .where(where)
      .orderBy(desc(impersonationSessions.startedAt))
      .limit(limit)
      .offset(offset);
  }
}
