import { Inject, Injectable } from '@nestjs/common';
import { and, desc, eq, isNull, ne } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { staffSessions } from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { StaffErrors } from './staff-errors';
import { MAX_PAGE_LIMIT } from '../../common/pagination';

/**
 * The staff member's own device list, backed by `staff_sessions` — the same
 * rows the refresh-token rotation reads, so revoking one here really does end
 * that device's session on its next request. A deliberate mirror of
 * OwnerSessionsService.
 */
@Injectable()
export class StaffSessionsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
  ) {}

  /** Live sessions, newest first. Revoked rows are gone from this view. */
  async list(staffId: string, currentSessionId: string) {
    const rows = await this.db
      .select()
      .from(staffSessions)
      .where(and(eq(staffSessions.staffId, staffId), isNull(staffSessions.revokedAt)))
      .orderBy(desc(staffSessions.createdAt))
      // A principal's live device list is small, but never return it unbounded.
      .limit(MAX_PAGE_LIMIT);
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
  async revoke(staffId: string, sessionId: string, currentSessionId: string) {
    const [row] = await this.db
      .select({ id: staffSessions.id })
      .from(staffSessions)
      .where(
        and(
          eq(staffSessions.id, sessionId),
          eq(staffSessions.staffId, staffId),
          isNull(staffSessions.revokedAt),
        ),
      )
      .limit(1);
    if (!row) throw StaffErrors.sessionNotFound();

    await this.db
      .update(staffSessions)
      .set({ revokedAt: new Date() })
      .where(eq(staffSessions.id, sessionId));

    const wasCurrent = sessionId === currentSessionId;
    await this.audit.record({
      action: 'staff.session.revoked',
      entity: 'staff_session',
      entityId: sessionId,
      after: { revoked: true, wasCurrent },
      actorId: staffId,
      actorRole: 'STAFF',
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
   * staff member is not locked out of the device they are holding.
   */
  async revokeAll(staffId: string, currentSessionId: string) {
    const revoked = await this.db
      .update(staffSessions)
      .set({ revokedAt: new Date() })
      .where(
        and(
          eq(staffSessions.staffId, staffId),
          ne(staffSessions.id, currentSessionId),
          isNull(staffSessions.revokedAt),
        ),
      )
      .returning({ id: staffSessions.id });

    await this.audit.record({
      action: 'staff.session.revoked_all',
      entity: 'staff',
      entityId: staffId,
      after: { revoked: revoked.map((r) => r.id), keptSessionId: currentSessionId },
      actorId: staffId,
      actorRole: 'STAFF',
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
