/* Seeds base permissions, system roles, and a super admin. Idempotent. */
import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import * as schema from '../src/database/schema';

// Permission catalog (see spec §RBAC). Each key is `group.action`.
const PERMISSIONS: { key: string; group: string; description: string }[] = [
  // owners
  { key: 'owner.view', group: 'Owner', description: 'View owners' },
  { key: 'owner.create', group: 'Owner', description: 'Create owners' },
  { key: 'owner.edit', group: 'Owner', description: 'Edit owners' },
  { key: 'owner.suspend', group: 'Owner', description: 'Suspend owners' },
  // property
  { key: 'property.view', group: 'Property', description: 'View properties' },
  { key: 'property.edit', group: 'Property', description: 'Edit properties' },
  { key: 'property.suspend', group: 'Property', description: 'Suspend properties' },
  // subscription
  { key: 'subscription.view', group: 'Subscription', description: 'View subscriptions' },
  { key: 'subscription.edit', group: 'Subscription', description: 'Edit subscriptions' },
  { key: 'subscription.cancel', group: 'Subscription', description: 'Cancel subscriptions' },
  // billing
  { key: 'billing.view', group: 'Billing', description: 'View billing' },
  { key: 'billing.refund', group: 'Billing', description: 'Issue refunds' },
  { key: 'billing.export', group: 'Billing', description: 'Export billing data' },
  // support
  { key: 'support.view', group: 'Support', description: 'View tickets' },
  { key: 'support.reply', group: 'Support', description: 'Reply to tickets' },
  { key: 'support.assign', group: 'Support', description: 'Assign tickets' },
  { key: 'support.resolve', group: 'Support', description: 'Resolve tickets' },
  // audit
  { key: 'audit.view', group: 'Audit', description: 'View audit logs' },
  { key: 'audit.export', group: 'Audit', description: 'Export audit logs' },
  // admin
  { key: 'admin.view', group: 'Admin', description: 'View admins/roles' },
  { key: 'admin.create', group: 'Admin', description: 'Create admins/roles' },
  { key: 'admin.edit', group: 'Admin', description: 'Edit admins/roles' },
  // impersonation
  { key: 'impersonation.start', group: 'Impersonation', description: 'Begin impersonation' },
  { key: 'impersonation.stop', group: 'Impersonation', description: 'End impersonation' },
];

const ROLES: {
  key: string;
  name: string;
  description: string;
  isSystem: boolean;
  permissions: string[];
}[] = [
  {
    key: 'super_admin',
    name: 'Super Admin',
    description: 'Unrestricted access to every capability',
    isSystem: true,
    permissions: ['*'],
  },
  {
    key: 'finance_admin',
    name: 'Finance Admin',
    description: 'Billing, refunds, subscription visibility',
    isSystem: true,
    permissions: [
      'billing.view',
      'billing.refund',
      'billing.export',
      'subscription.view',
      'owner.view',
    ],
  },
  {
    key: 'support_admin',
    name: 'Support Admin',
    description: 'Ticketing and owner support',
    isSystem: true,
    permissions: [
      'support.view',
      'support.reply',
      'support.assign',
      'support.resolve',
      'owner.view',
      'impersonation.start',
    ],
  },
  {
    key: 'operations_admin',
    name: 'Operations Admin',
    description: 'Read-only operations view',
    isSystem: true,
    permissions: ['owner.view', 'subscription.view', 'property.view'],
  },
  {
    key: 'platform_admin',
    name: 'Platform Admin',
    description: 'Platform configuration and owner lifecycle',
    isSystem: true,
    permissions: [
      'owner.view',
      'owner.create',
      'owner.edit',
      'subscription.view',
      'subscription.edit',
      'property.view',
      'property.edit',
    ],
  },
];

const SEED_ADMINS: { email: string; name: string; roleKey: string; envPassword?: string }[] = [
  {
    email: process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@travelo.local',
    name: 'Super Admin',
    roleKey: 'super_admin',
    envPassword: process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!12345',
  },
  { email: 'finance@travelo.local', name: 'Finance Admin', roleKey: 'finance_admin' },
  { email: 'support@travelo.local', name: 'Support Admin', roleKey: 'support_admin' },
  { email: 'ops@travelo.local', name: 'Operations Admin', roleKey: 'operations_admin' },
  { email: 'platform@travelo.local', name: 'Platform Admin', roleKey: 'platform_admin' },
];

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required');
  const pool = new Pool({
    connectionString: url,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  const db = drizzle(pool, { schema });

  console.log('Seeding permissions...');
  for (const p of PERMISSIONS) {
    await db
      .insert(schema.permissions)
      .values(p)
      .onConflictDoNothing({ target: schema.permissions.key });
  }

  console.log('Seeding roles...');
  for (const r of ROLES) {
    const existing = await db.select().from(schema.roles).where(eq(schema.roles.key, r.key)).limit(1);
    let roleId: string;
    if (existing.length) {
      roleId = existing[0].id;
      await db
        .update(schema.roles)
        .set({ name: r.name, description: r.description, isSystem: r.isSystem, updatedAt: new Date() })
        .where(eq(schema.roles.id, roleId));
    } else {
      const [inserted] = await db
        .insert(schema.roles)
        .values({ key: r.key, name: r.name, description: r.description, isSystem: r.isSystem })
        .returning();
      roleId = inserted.id;
    }
    await db.delete(schema.rolePermissions).where(eq(schema.rolePermissions.roleId, roleId));
    if (r.permissions.length) {
      await db
        .insert(schema.rolePermissions)
        .values(r.permissions.map((k) => ({ roleId, permissionKey: k })));
    }
  }

  console.log('Seeding admins...');
  for (const a of SEED_ADMINS) {
    const [existing] = await db
      .select()
      .from(schema.admins)
      .where(eq(schema.admins.email, a.email.toLowerCase()))
      .limit(1);
    let adminId: string;
    if (existing) {
      adminId = existing.id;
    } else {
      const password = a.envPassword ?? cryptoRandom(20);
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      const [inserted] = await db
        .insert(schema.admins)
        .values({ email: a.email.toLowerCase(), name: a.name, passwordHash, status: 'Active' })
        .returning();
      adminId = inserted.id;
      console.log(`  created ${a.email} (password: ${a.envPassword ? '<from env>' : password})`);
    }
    const [role] = await db.select().from(schema.roles).where(eq(schema.roles.key, a.roleKey)).limit(1);
    if (role) {
      await db
        .insert(schema.adminRoles)
        .values({ adminId, roleId: role.id })
        .onConflictDoNothing();
    }
  }

  console.log('Seed complete.');
  await pool.end();
}

function cryptoRandom(n: number): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@#$%';
  let out = '';
  for (let i = 0; i < n; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
