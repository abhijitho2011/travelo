import { Inject, Injectable, Logger } from '@nestjs/common';
import { eq, inArray } from 'drizzle-orm';
import { DRIZZLE, Database } from '../../database/database.module';
import { adminRoles, permissions, rolePermissions, roles } from '../../database/schema';
import { REDIS, RedisClient } from '../../queue/redis.provider';

const CACHE_TTL_SECONDS = 300;

@Injectable()
export class PermissionsService {
  private readonly logger = new Logger(PermissionsService.name);
  private readonly memoryCache = new Map<
    string,
    { at: number; perms: string[]; roles: string[] }
  >();

  constructor(
    @Inject(DRIZZLE) private readonly db: Database,
    @Inject(REDIS) private readonly redis: RedisClient,
  ) {}

  private cacheKey(adminId: string): string {
    return `perms:${adminId}`;
  }

  async getEffectivePermissions(
    adminId: string,
  ): Promise<{ roles: string[]; permissions: string[] }> {
    const cached = await this.readCache(adminId);
    if (cached) return cached;

    const adminRoleRows = await this.db
      .select({ roleId: adminRoles.roleId })
      .from(adminRoles)
      .where(eq(adminRoles.adminId, adminId));
    const roleIds = adminRoleRows.map((r) => r.roleId);

    if (roleIds.length === 0) {
      const empty = { roles: [] as string[], permissions: [] as string[] };
      await this.writeCache(adminId, empty);
      return empty;
    }

    const roleRows = await this.db
      .select({ id: roles.id, key: roles.key, name: roles.name })
      .from(roles)
      .where(inArray(roles.id, roleIds));

    const permRows = await this.db
      .select({ key: rolePermissions.permissionKey })
      .from(rolePermissions)
      .where(inArray(rolePermissions.roleId, roleIds));

    const permSet = new Set<string>(permRows.map((p) => p.key));
    const result = {
      roles: roleRows.map((r) => r.name),
      permissions: Array.from(permSet),
    };
    await this.writeCache(adminId, result);
    return result;
  }

  async invalidate(adminId: string): Promise<void> {
    this.memoryCache.delete(this.cacheKey(adminId));
    if (this.redis) {
      try {
        await this.redis.del(this.cacheKey(adminId));
      } catch (err) {
        this.logger.warn(`Redis invalidate failed: ${(err as Error).message}`);
      }
    }
  }

  static matches(required: string[], granted: string[]): boolean {
    if (required.length === 0) return true;
    if (granted.includes('*')) return true;
    const grantedSet = new Set(granted);
    return required.every((r) => {
      if (grantedSet.has(r)) return true;
      // wildcard segment match: e.g. granted "admin.*" satisfies required "admin.create"
      for (const g of grantedSet) {
        if (g.endsWith('.*') && r.startsWith(g.slice(0, -1))) return true;
      }
      return false;
    });
  }

  async listAll(): Promise<{ key: string; group: string; description: string | null }[]> {
    return this.db
      .select({
        key: permissions.key,
        group: permissions.group,
        description: permissions.description,
      })
      .from(permissions)
      .orderBy(permissions.group, permissions.key);
  }

  private async readCache(adminId: string) {
    const key = this.cacheKey(adminId);
    if (this.redis) {
      try {
        const raw = await this.redis.get(key);
        if (raw) return JSON.parse(raw) as { roles: string[]; permissions: string[] };
      } catch (err) {
        this.logger.warn(`Redis read failed: ${(err as Error).message}`);
      }
    }
    const mem = this.memoryCache.get(key);
    if (mem && Date.now() - mem.at < CACHE_TTL_SECONDS * 1000) {
      return { roles: mem.roles, permissions: mem.perms };
    }
    return null;
  }

  private async writeCache(adminId: string, value: { roles: string[]; permissions: string[] }) {
    const key = this.cacheKey(adminId);
    if (this.redis) {
      try {
        await this.redis.set(key, JSON.stringify(value), 'EX', CACHE_TTL_SECONDS);
        return;
      } catch (err) {
        this.logger.warn(`Redis write failed: ${(err as Error).message}`);
      }
    }
    this.memoryCache.set(key, { at: Date.now(), roles: value.roles, perms: value.permissions });
  }
}
