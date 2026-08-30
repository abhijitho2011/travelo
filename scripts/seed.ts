/* Seeds phase-1 auth + phase-2 catalog (features/plans) + sample owners/properties/subscriptions. */
import 'dotenv/config';
import { Pool } from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import { eq } from 'drizzle-orm';
import * as argon2 from 'argon2';
import * as schema from '../src/database/schema';
import { normalizeMobile } from '../src/modules/shared-auth/mobile.util';

// ---------- Permission catalog ----------
const PERMISSIONS: { key: string; group: string; description: string }[] = [
  ...groupPerms('Owner', 'owner', ['view', 'create', 'edit', 'suspend', 'delete']),
  ...groupPerms('Property', 'property', ['view', 'edit', 'suspend']),
  ...groupPerms('Staff', 'staff', ['read', 'manage']),
  ...groupPerms('Subscription', 'subscription', ['view', 'edit', 'cancel']),
  ...groupPerms('Plan', 'plan', ['view', 'edit']),
  ...groupPerms('Billing', 'billing', ['view', 'refund', 'export']),
  ...groupPerms('Payment', 'payment', ['record']),
  ...groupPerms('Refund', 'refund', ['view', 'create']),
  ...groupPerms('Invoice', 'invoice', ['view', 'create', 'edit']),
  ...groupPerms('Support', 'support', ['view', 'reply', 'assign', 'resolve']),
  ...groupPerms('Impersonation', 'impersonation', ['view', 'start', 'stop']),
  ...groupPerms('Announcement', 'announcement', ['view', 'edit']),
  ...groupPerms('Notification', 'notification', ['view', 'edit']),
  ...groupPerms('Integration', 'integration', ['view', 'sync']),
  ...groupPerms('Job', 'job', ['view', 'retry']),
  ...groupPerms('Analytics', 'analytics', ['view']),
  ...groupPerms('Search', 'search', ['query']),
  ...groupPerms('Audit', 'audit', ['view', 'export']),
  ...groupPerms('Admin', 'admin', ['view', 'create', 'edit']),
  // Settings surface (location catalogue + amenity catalogue). Keys must match
  // what the admin controllers guard on and what scripts/seed-node.mjs grants.
  ...groupPerms('Settings', 'settings', ['locations.manage', 'amenities.manage']),
];

function groupPerms(group: string, prefix: string, actions: string[]) {
  return actions.map((a) => ({
    key: `${prefix}.${a}`,
    group,
    description: `${a} ${group.toLowerCase()}`,
  }));
}

const ROLES = [
  { key: 'super_admin', name: 'Super Admin', description: 'Unrestricted access', isSystem: true, permissions: ['*'] },
  {
    key: 'finance_admin',
    name: 'Finance Admin',
    description: 'Billing, refunds, subscriptions, invoices',
    isSystem: true,
    permissions: [
      'billing.view', 'billing.refund', 'billing.export',
      'payment.record',
      'refund.view', 'refund.create',
      'invoice.view', 'invoice.create', 'invoice.edit',
      'subscription.view', 'subscription.edit',
      'owner.view', 'analytics.view', 'search.query', 'notification.view',
    ],
  },
  {
    key: 'support_admin',
    name: 'Support Admin',
    description: 'Ticketing, owner support, impersonation',
    isSystem: true,
    permissions: [
      'support.view', 'support.reply', 'support.assign', 'support.resolve',
      'owner.view', 'property.view', 'staff.read', 'subscription.view',
      'impersonation.start', 'impersonation.stop', 'impersonation.view',
      'notification.view', 'search.query',
    ],
  },
  {
    key: 'operations_admin',
    name: 'Operations Admin',
    description: 'Operational view + jobs',
    isSystem: true,
    permissions: [
      'owner.view', 'subscription.view', 'property.view', 'staff.read', 'staff.manage',
      'integration.view', 'integration.sync', 'job.view', 'job.retry',
      'analytics.view', 'search.query', 'notification.view',
      'settings.locations.manage', 'settings.amenities.manage',
    ],
  },
  {
    key: 'platform_admin',
    name: 'Platform Admin',
    description: 'Plans, announcements, notifications',
    isSystem: true,
    permissions: [
      'owner.view', 'owner.create', 'owner.edit',
      'property.view', 'property.edit', 'staff.read',
      'subscription.view', 'subscription.edit',
      'plan.view', 'plan.edit',
      'announcement.view', 'announcement.edit',
      'notification.view', 'notification.edit',
      'search.query', 'analytics.view',
    ],
  },
];

/**
 * The super-admin identity is driven entirely by env. SUPER_ADMIN_EMAIL /
 * SUPER_ADMIN_MOBILE are the allowlist used by Google and OTP sign-in, so the
 * seeded row is kept in sync with them on every run (idempotent).
 */
const SUPER_ADMIN_EMAIL = (
  process.env.SUPER_ADMIN_EMAIL ??
  process.env.SEED_SUPER_ADMIN_EMAIL ??
  'admin@tavelo.local'
)
  .trim()
  .toLowerCase();
const SUPER_ADMIN_MOBILE = normalizeMobile(process.env.SUPER_ADMIN_MOBILE);

const SEED_ADMINS: {
  email: string;
  name: string;
  roleKey: string;
  envPassword?: string;
  mobile?: string | null;
}[] = [
  {
    email: SUPER_ADMIN_EMAIL,
    name: 'Super Admin',
    roleKey: 'super_admin',
    envPassword: process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!12345',
    mobile: SUPER_ADMIN_MOBILE,
  },
  { email: 'finance@tavelo.local', name: 'Finance Admin', roleKey: 'finance_admin' },
  { email: 'support@tavelo.local', name: 'Support Admin', roleKey: 'support_admin' },
  { email: 'ops@tavelo.local', name: 'Operations Admin', roleKey: 'operations_admin' },
  { email: 'platform@tavelo.local', name: 'Platform Admin', roleKey: 'platform_admin' },
];

const FEATURES = [
  'PMS', 'BOOKING_ENGINE', 'CHANNEL_MANAGER', 'HOUSEKEEPING', 'MAINTENANCE',
  'PROCUREMENT', 'INVENTORY', 'RESTAURANT', 'ERP', 'CRM', 'ANALYTICS', 'API', 'OFFLINE_MODE',
];

const PLANS = [
  {
    name: 'BASIC',
    description: 'Starter plan — 1 property',
    monthlyPrice: 400000, // ₹4000 = 400000 paise
    annualPrice: 4000000,
    propertyLimit: 1,
    features: ['PMS', 'BOOKING_ENGINE', 'HOUSEKEEPING', 'ANALYTICS'],
  },
  {
    name: 'PRO',
    description: 'Pro plan — 3 properties',
    monthlyPrice: 800000, // ₹8000
    annualPrice: 8000000,
    propertyLimit: 3,
    features: ['PMS', 'BOOKING_ENGINE', 'CHANNEL_MANAGER', 'HOUSEKEEPING', 'MAINTENANCE', 'RESTAURANT', 'CRM', 'ANALYTICS', 'API'],
  },
];

const SAMPLE_OWNERS = [
  { name: 'Rajesh Menon', email: 'rajesh@abchospitality.in', company: 'ABC Hospitality Pvt Ltd', city: 'Kochi', country: 'India', plan: 'PRO', propertyName: 'Kochi Grand Hotel' },
  { name: 'Anita Deshpande', email: 'anita@sahyadriresorts.com', company: 'Sahyadri Resorts LLP', city: 'Pune', country: 'India', plan: 'BASIC', propertyName: 'Sahyadri Valley Resort' },
  { name: 'Faisal Rahman', email: 'faisal@marinebay.co', company: 'Marine Bay Hotels', city: 'Dubai', country: 'UAE', plan: 'PRO', propertyName: 'Marine Bay Downtown' },
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
    const isSuperAdmin = a.roleKey === 'super_admin';
    let [existing] = await db
      .select()
      .from(schema.admins)
      .where(eq(schema.admins.email, a.email.toLowerCase()))
      .limit(1);

    // The super admin may already exist under a previous email — find it by
    // role so the row is updated rather than duplicated.
    if (!existing && isSuperAdmin) {
      const [superRole] = await db
        .select()
        .from(schema.roles)
        .where(eq(schema.roles.key, 'super_admin'))
        .limit(1);
      if (superRole) {
        const [link] = await db
          .select()
          .from(schema.adminRoles)
          .where(eq(schema.adminRoles.roleId, superRole.id))
          .limit(1);
        if (link) {
          const [row] = await db
            .select()
            .from(schema.admins)
            .where(eq(schema.admins.id, link.adminId))
            .limit(1);
          existing = row;
        }
      }
    }

    let adminId: string;
    if (existing) {
      adminId = existing.id;
      // Keep email/mobile aligned with the environment (idempotent).
      const patch: Record<string, unknown> = {};
      if (existing.email !== a.email.toLowerCase()) patch.email = a.email.toLowerCase();
      if (a.mobile !== undefined && existing.mobile !== a.mobile) patch.mobile = a.mobile;
      if (Object.keys(patch).length) {
        patch.updatedAt = new Date();
        await db.update(schema.admins).set(patch).where(eq(schema.admins.id, adminId));
        console.log(`  updated ${a.email} (${Object.keys(patch).join(', ')})`);
      }
    } else {
      const password = a.envPassword ?? cryptoRandom(20);
      const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
      const [inserted] = await db
        .insert(schema.admins)
        .values({
          email: a.email.toLowerCase(),
          name: a.name,
          passwordHash,
          status: 'Active',
          mobile: a.mobile ?? null,
        })
        .returning();
      adminId = inserted.id;
      console.log(`  created ${a.email} (password: ${a.envPassword ? '<from env>' : password})`);
    }
    const [role] = await db.select().from(schema.roles).where(eq(schema.roles.key, a.roleKey)).limit(1);
    if (role) {
      await db.insert(schema.adminRoles).values({ adminId, roleId: role.id }).onConflictDoNothing();
    }
  }

  console.log('Seeding feature catalog...');
  for (const key of FEATURES) {
    await db
      .insert(schema.features)
      .values({ key, name: key.replace(/_/g, ' ') })
      .onConflictDoNothing({ target: schema.features.key });
  }

  console.log('Seeding plans...');
  const planIds = new Map<string, string>();
  for (const p of PLANS) {
    const existing = await db
      .select()
      .from(schema.subscriptionPlans)
      .where(eq(schema.subscriptionPlans.name, p.name))
      .limit(1);
    let id: string;
    if (existing.length) {
      id = existing[0].id;
      await db
        .update(schema.subscriptionPlans)
        .set({
          description: p.description,
          monthlyPrice: p.monthlyPrice,
          annualPrice: p.annualPrice,
          propertyLimit: p.propertyLimit,
          updatedAt: new Date(),
        })
        .where(eq(schema.subscriptionPlans.id, id));
    } else {
      const [inserted] = await db
        .insert(schema.subscriptionPlans)
        .values({
          name: p.name,
          description: p.description,
          monthlyPrice: p.monthlyPrice,
          annualPrice: p.annualPrice,
          propertyLimit: p.propertyLimit,
        })
        .returning();
      id = inserted.id;
    }
    planIds.set(p.name, id);
    await db.delete(schema.planFeatures).where(eq(schema.planFeatures.planId, id));
    await db
      .insert(schema.planFeatures)
      .values(p.features.map((k) => ({ planId: id, featureKey: k })))
      .onConflictDoNothing();
  }

  console.log('Seeding sample owners/properties/subscriptions...');
  for (const s of SAMPLE_OWNERS) {
    const [existing] = await db
      .select()
      .from(schema.owners)
      .where(eq(schema.owners.email, s.email.toLowerCase()))
      .limit(1);
    let ownerId: string;
    if (existing) {
      ownerId = existing.id;
    } else {
      const [row] = await db
        .insert(schema.owners)
        .values({
          name: s.name,
          email: s.email.toLowerCase(),
          company: s.company,
          city: s.city,
          country: s.country,
          status: 'ACTIVE',
        })
        .returning();
      ownerId = row.id;
    }
    const [prop] = await db
      .select()
      .from(schema.properties)
      .where(eq(schema.properties.ownerId, ownerId))
      .limit(1);
    if (!prop) {
      await db.insert(schema.properties).values({
        ownerId,
        name: s.propertyName,
        slug: s.propertyName.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + Math.random().toString(36).slice(2, 6),
        city: s.city,
        country: s.country,
        status: 'ACTIVE',
        listingStatus: 'Published',
        roomCount: 60,
        listingCompleteness: 80,
      });
    }
    const planId = planIds.get(s.plan);
    if (planId) {
      const [sub] = await db
        .select()
        .from(schema.subscriptions)
        .where(eq(schema.subscriptions.ownerId, ownerId))
        .limit(1);
      if (!sub) {
        const now = new Date();
        const end = new Date(now);
        end.setMonth(end.getMonth() + 12);
        await db.insert(schema.subscriptions).values({
          ownerId,
          planId,
          status: 'ACTIVE',
          billingCycle: 'ANNUAL',
          startsAt: now,
          currentPeriodStart: now,
          currentPeriodEnd: end,
        });
      }
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
