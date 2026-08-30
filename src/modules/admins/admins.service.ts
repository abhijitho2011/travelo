import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { admins, adminRoles, roles, adminSessions } from '../../database/schema';
import { AuthService } from '../auth/auth.service';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from '../permissions/permissions.service';
import { MAX_PAGE_LIMIT } from '../../common/pagination';

@Injectable()
export class AdminsService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly perms: PermissionsService,
  ) {}

  async list(params: { limit?: number; offset?: number; q?: string }) {
    const limit = Math.min(params.limit ?? 50, 200);
    const offset = params.offset ?? 0;
    const rows = await this.db
      .select()
      .from(admins)
      .where(isNull(admins.deletedAt))
      .orderBy(desc(admins.createdAt))
      .limit(limit)
      .offset(offset);

    const ids = rows.map((r) => r.id);
    const arRows = ids.length
      ? await this.db
          .select({
            adminId: adminRoles.adminId,
            roleName: roles.name,
            roleKey: roles.key,
          })
          .from(adminRoles)
          .innerJoin(roles, eq(adminRoles.roleId, roles.id))
          .where(inArray(adminRoles.adminId, ids))
      : [];

    const rolesByAdmin = new Map<string, { name: string; key: string }[]>();
    for (const r of arRows) {
      const arr = rolesByAdmin.get(r.adminId) ?? [];
      arr.push({ name: r.roleName, key: r.roleKey });
      rolesByAdmin.set(r.adminId, arr);
    }

    const [{ total }] = await this.db
      .select({ total: sql<number>`count(*)::int` })
      .from(admins)
      .where(isNull(admins.deletedAt));

    return {
      items: rows.map((r) => this.serialize(r, rolesByAdmin.get(r.id) ?? [])),
      total,
      limit,
      offset,
    };
  }

  async get(id: string) {
    const [row] = await this.db.select().from(admins).where(eq(admins.id, id)).limit(1);
    if (!row || row.deletedAt) throw new NotFoundException('Admin not found');
    const rs = await this.db
      .select({ name: roles.name, key: roles.key })
      .from(adminRoles)
      .innerJoin(roles, eq(adminRoles.roleId, roles.id))
      .where(eq(adminRoles.adminId, id));
    return this.serialize(row, rs);
  }

  async create(dto: { email: string; name: string; password: string; roleKeys?: string[] }) {
    const existing = await this.db
      .select({ id: admins.id })
      .from(admins)
      .where(eq(admins.email, dto.email.toLowerCase()))
      .limit(1);
    if (existing.length) throw new ConflictException('Email already registered');

    const passwordHash = await AuthService.hashPassword(dto.password);
    const [inserted] = await this.db
      .insert(admins)
      .values({
        email: dto.email.toLowerCase(),
        name: dto.name,
        passwordHash,
        status: 'Active',
      })
      .returning();

    if (dto.roleKeys && dto.roleKeys.length) {
      await this.assignRolesByKey(inserted.id, dto.roleKeys);
    }

    await this.audit.record({
      action: 'admin.created',
      entity: 'admin',
      entityId: inserted.id,
      after: { email: inserted.email, name: inserted.name, roleKeys: dto.roleKeys ?? [] },
    });

    return this.get(inserted.id);
  }

  async update(id: string, dto: { name?: string; roleKeys?: string[] }) {
    const before = await this.get(id);
    if (dto.name) {
      await this.db
        .update(admins)
        .set({ name: dto.name, updatedAt: new Date() })
        .where(eq(admins.id, id));
    }
    if (dto.roleKeys) {
      await this.db.delete(adminRoles).where(eq(adminRoles.adminId, id));
      if (dto.roleKeys.length) await this.assignRolesByKey(id, dto.roleKeys);
      await this.perms.invalidate(id);
    }
    const after = await this.get(id);
    await this.audit.record({
      action: 'admin.updated',
      entity: 'admin',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  async setStatus(id: string, status: 'Active' | 'Inactive' | 'Blocked', reason?: string) {
    const before = await this.get(id);
    await this.db.update(admins).set({ status, updatedAt: new Date() }).where(eq(admins.id, id));
    if (status !== 'Active') {
      // Revoke all sessions on deactivation/block.
      await this.db
        .update(adminSessions)
        .set({ revokedAt: new Date() })
        .where(and(eq(adminSessions.adminId, id), isNull(adminSessions.revokedAt)));
    }
    await this.perms.invalidate(id);
    const after = await this.get(id);
    await this.audit.record({
      action: `admin.status.${status.toLowerCase()}`,
      entity: 'admin',
      entityId: id,
      before,
      after,
      reason,
    });
    return after;
  }

  async listSessions(adminId: string) {
    const rows = await this.db
      .select()
      .from(adminSessions)
      .where(eq(adminSessions.adminId, adminId))
      .orderBy(desc(adminSessions.createdAt))
      // Bounded: an admin's session history is small, never return it unbounded.
      .limit(MAX_PAGE_LIMIT);
    return rows.map((s) => ({
      id: s.id,
      ip: s.ip,
      userAgent: s.userAgent,
      createdAt: s.createdAt,
      lastUsedAt: s.lastUsedAt,
      expiresAt: s.expiresAt,
      revokedAt: s.revokedAt,
      active: !s.revokedAt && s.expiresAt.getTime() > Date.now(),
    }));
  }

  async revokeSession(adminId: string, sessionId: string) {
    const [row] = await this.db
      .select()
      .from(adminSessions)
      .where(and(eq(adminSessions.id, sessionId), eq(adminSessions.adminId, adminId)))
      .limit(1);
    if (!row) throw new NotFoundException('Session not found');
    await this.db
      .update(adminSessions)
      .set({ revokedAt: new Date() })
      .where(eq(adminSessions.id, sessionId));
    await this.audit.record({
      action: 'admin.session.revoked',
      entity: 'admin_session',
      entityId: sessionId,
    });
    return { revoked: true };
  }

  private async assignRolesByKey(adminId: string, keys: string[]) {
    const rows = await this.db.select().from(roles).where(inArray(roles.key, keys));
    if (rows.length !== keys.length) {
      const found = new Set(rows.map((r) => r.key));
      const missing = keys.filter((k) => !found.has(k));
      throw new BadRequestException(`Unknown role keys: ${missing.join(', ')}`);
    }
    await this.db
      .insert(adminRoles)
      .values(rows.map((r) => ({ adminId, roleId: r.id })))
      .onConflictDoNothing();
    await this.perms.invalidate(adminId);
  }

  private serialize(admin: typeof admins.$inferSelect, rs: { name: string; key: string }[]) {
    return {
      id: admin.id,
      email: admin.email,
      name: admin.name,
      status: admin.status,
      mfa: admin.mfaEnabled ? 'Enabled' : 'Disabled',
      role: rs.map((r) => r.name).join(', ') || 'Unassigned',
      roles: rs,
      lastLogin: admin.lastLoginAt,
      lastLoginIp: admin.lastLoginIp,
      createdAt: admin.createdAt,
      updatedAt: admin.updatedAt,
    };
  }
}
