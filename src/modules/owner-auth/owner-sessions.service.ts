import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { ownerSessions } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { OwnerErrors } from './owner-errors';

/**
 * The owner's own device list, backed by `owner_sessions` — the same rows the
 * refresh-token rotation reads, so revoking one here really does end that
 * device's session on its next request.
 */
@Injectable()
export class OwnerSessionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  /** Live sessions, newest first. Revoked rows are gone from this view. */
  async list(ownerId: string, currentSessionId: string) {
    const rows = await this.db
      .select()
      .from(ownerSessions)
      .where(and(eq(ownerSessions.ownerId, ownerId), isNull(ownerSessions.revokedAt)))
      .orderBy(desc(ownerSessions.createdAt));
    return rows.map((s) => ({
      id: s.id,
      ip: s.ip,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      expiresAt: s.expiresAt,
      current: s.id === currentSessionId,
    }));
  }

  /**
   * Revoke one session. Revoking the session behind the presented token is
   * allowed — it is how "sign out this device" works — but the response says so
   * plainly, because the caller's very next request will 401.
   */
  async revoke(ownerId: string, sessionId: string, currentSessionId: string) {
    const [row] = await this.db
      .select({ id: ownerSessions.id })
      .from(ownerSessions)
      .where(
        and(
          eq(ownerSessions.id, sessionId),
          eq(ownerSessions.ownerId, ownerId),
          isNull(ownerSessions.revokedAt),
        ),
      )
      .limit(1);
    if (!row) throw OwnerErrors.sessionNotFound();

    await this.db
      .update(ownerSessions)
      .set({ revokedAt: new Date() })
      .where(eq(ownerSessions.id, sessionId));

    const wasCurrent = sessionId === currentSessionId;
    await this.audit.record({
      action: 'owner.session.revoked',
      entity: 'owner_session',
      entityId: sessionId,
      after: { revoked: true, wasCurrent },
      actorId: ownerId,
      actorRole: 'OWNER',
    });
    return {
      id: sessionId,
      revoked: true,
      wasCurrent,
      message: wasCurrent
        ? 'This device has been signed out. You will need to sign in again.'
        : 'That device has been signed out.',
    };
  }

  /**
   * Sign out everywhere else. The current session is explicitly spared so the
   * owner is not locked out of the device they are holding.
   */
  async revokeAll(ownerId: string, currentSessionId: string) {
    const revoked = await this.db
      .update(ownerSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(ownerSessions.ownerId, ownerId),
          ne(ownerSessions.id, currentSessionId),
          isNull(ownerSessions.revokedAt),
        ),
      )
      .returning({ id: ownerSessions.id });

    await this.audit.record({
      action: 'owner.session.revoked_all',
      entity: 'owner',
      entityId: ownerId,
      after: { revoked: revoked.map((r) => r.id), keptSessionId: currentSessionId },
      actorId: ownerId,
      actorRole: 'OWNER',
    });
    return {
      revoked: revoked.length,
      keptSessionId: currentSessionId,
      message:
        revoked.length === 0
          ? 'No other devices were signed in.'
          : `Signed out of ${revoked.length} other device${revoked.length === 1 ? '' : 's'}.`,
    };
  }
}
