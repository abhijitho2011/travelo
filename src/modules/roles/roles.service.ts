import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { eq, inArray, sql } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import {
  adminRoles,
  permissions as permissionsTable,
  rolePermissions,
  roles,
} from '../../database/schema';
import { AuditService } from '../audit/audit.service';
import { PermissionsService } from '../permissions/permissions.service';

@Injectable()
export class RolesService {
  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    private readonly audit: AuditService,
    private readonly perms: PermissionsService,
  ) {}

  async list() {
    const rs = await this.db.select().from(roles);
    const rpRows = await this.db.select().from(rolePermissions);
    const counts = await this.db
      .select({
        roleId: adminRoles.roleId,
        count: sql<number>`count(*)::int`,
      })
      .from(adminRoles)
      .groupBy(adminRoles.roleId);
    const permsByRole = new Map<string, string[]>();
    for (const rp of rpRows) {
      const arr = permsByRole.get(rp.roleId) ?? [];
      arr.push(rp.permissionKey);
      permsByRole.set(rp.roleId, arr);
    }
    const countsByRole = new Map<string, number>(counts.map((c) => [c.roleId, c.count]));
    return rs.map((r) => ({
      id: r.id,
      key: r.key,
      name: r.name,
      description: r.description,
      isSystem: r.isSystem,
      permissions: permsByRole.get(r.id) ?? [],
      adminCount: countsByRole.get(r.id) ?? 0,
      createdAt: r.createdAt,
      updatedAt: r.updatedAt,
    }));
  }

  async create(dto: { key: string; name: string; description?: string; permissions?: string[] }) {
    const existing = await this.db
      .select({ id: roles.id })
      .from(roles)
      .where(eq(roles.key, dto.key))
      .limit(1);
    if (existing.length) throw new ConflictException('Role key exists');
    const [row] = await this.db
      .insert(roles)
      .values({ key: dto.key, name: dto.name, description: dto.description ?? null })
      .returning();
    if (dto.permissions?.length) await this.setPermissions(row.id, dto.permissions);
    await this.audit.record({
      action: 'role.created',
      entity: 'role',
      entityId: row.id,
      after: { key: dto.key, name: dto.name, permissions: dto.permissions ?? [] },
    });
    return this.getById(row.id);
  }

  async update(id: string, dto: { name?: string; description?: string; permissions?: string[] }) {
    const before = await this.getById(id);
    if (before.isSystem && dto.permissions) {
      throw new BadRequestException('System role permissions are immutable');
    }
    if (dto.name || dto.description !== undefined) {
      await this.db
        .update(roles)
        .set({
          name: dto.name ?? before.name,
          description: dto.description ?? before.description,
          updatedAt: new Date(),
        })
        .where(eq(roles.id, id));
    }
    if (dto.permissions) {
      await this.setPermissions(id, dto.permissions);
      // Invalidate every admin bound to this role.
      const bound = await this.db
        .select({ adminId: adminRoles.adminId })
        .from(adminRoles)
        .where(eq(adminRoles.roleId, id));
      await Promise.all(bound.map((b) => this.perms.invalidate(b.adminId)));
    }
    const after = await this.getById(id);
    await this.audit.record({
      action: 'role.updated',
      entity: 'role',
      entityId: id,
      before,
      after,
    });
    return after;
  }

  async getById(id: string) {
    const [row] = await this.db.select().from(roles).where(eq(roles.id, id)).limit(1);
    if (!row) throw new NotFoundException('Role not found');
    const perms = await this.db
      .select({ key: rolePermissions.permissionKey })
      .from(rolePermissions)
      .where(eq(rolePermissions.roleId, id));
    return {
      id: row.id,
      key: row.key,
      name: row.name,
      description: row.description,
      isSystem: row.isSystem,
      permissions: perms.map((p) => p.key),
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  }

  private async setPermissions(roleId: string, keys: string[]) {
    // Validate every key exists (except wildcard).
    const nonWildcard = keys.filter((k) => k !== '*');
    if (nonWildcard.length) {
      const found = await this.db
        .select({ key: permissionsTable.key })
        .from(permissionsTable)
        .where(inArray(permissionsTable.key, nonWildcard));
      const foundSet = new Set(found.map((f) => f.key));
      const missing = nonWildcard.filter((k) => !foundSet.has(k));
      if (missing.length)
        throw new BadRequestException(`Unknown permissions: ${missing.join(', ')}`);
    }
    await this.db.delete(rolePermissions).where(eq(rolePermissions.roleId, roleId));
    if (keys.length) {
      await this.db.insert(rolePermissions).values(keys.map((k) => ({ roleId, permissionKey: k })));
    }
  }
}
