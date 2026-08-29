#!/usr/bin/env node
// Pure-node seed for Railway runtime image (no tsx, no schema import).
// Idempotent — uses ON CONFLICT DO NOTHING and existence checks.

import pg from 'pg';
import argon2 from 'argon2';

const PERMISSIONS = [
  ['Owner', 'owner', ['view', 'create', 'edit', 'suspend', 'delete']],
  ['Property', 'property', ['view', 'edit', 'suspend']],
  ['Staff', 'staff', ['read', 'manage']],
  ['Subscription', 'subscription', ['view', 'edit', 'cancel']],
  ['Plan', 'plan', ['view', 'edit']],
  ['Billing', 'billing', ['view', 'refund', 'export']],
  ['Payment', 'payment', ['record']],
  ['Refund', 'refund', ['view', 'create']],
  ['Invoice', 'invoice', ['view', 'create', 'edit']],
  ['Support', 'support', ['view', 'reply', 'assign', 'resolve']],
  ['Impersonation', 'impersonation', ['view', 'start', 'stop']],
  ['Announcement', 'announcement', ['view', 'edit']],
  ['Notification', 'notification', ['view', 'edit']],
  ['Integration', 'integration', ['view','sync']],
  ['Job', 'job', ['view', 'retry']],
  ['Analytics', 'analytics', ['view']],
  ['Search', 'search', ['query']],
  ['Audit', 'audit', ['view', 'export']],
  ['Admin', 'admin', ['view', 'create', 'edit']],
  ['Settings', 'settings', ['locations.manage', 'amenities.manage']],
].flatMap(([group, prefix, actions]) =>
  actions.map((a) => ({ key: `${prefix}.${a}`, group, description: `${a} ${group.toLowerCase()}` })),
);

const ROLES = [
  { key: 'super_admin', name: 'Super Admin', description: 'Unrestricted access', permissions: ['*'] },
  { key: 'finance_admin', name: 'Finance Admin', description: 'Billing / refunds / invoices', permissions: ['billing.view','billing.refund','billing.export','payment.record','refund.view','refund.create','invoice.view','invoice.create','invoice.edit','subscription.view','subscription.edit','owner.view','analytics.view','search.query','notification.view'] },
  { key: 'support_admin', name: 'Support Admin', description: 'Support + impersonation', permissions: ['support.view','support.reply','support.assign','support.resolve','owner.view','property.view','staff.read','subscription.view','impersonation.start','impersonation.stop','impersonation.view','notification.view','search.query'] },
  { key: 'operations_admin', name: 'Operations Admin', description: 'Operational view + jobs', permissions: ['owner.view','subscription.view','property.view','staff.read','staff.manage','integration.view','integration.sync','job.view','job.retry','analytics.view','search.query','notification.view','settings.locations.manage','settings.amenities.manage'] },
  { key: 'platform_admin', name: 'Platform Admin', description: 'Plans + announcements', permissions: ['owner.view','owner.create','owner.edit','property.view','property.edit','staff.read','subscription.view','subscription.edit','plan.view','plan.edit','announcement.view','announcement.edit','notification.view','notification.edit','search.query','analytics.view'] },
];

const ADMINS = [
  { email: process.env.SEED_SUPER_ADMIN_EMAIL ?? 'admin@tavelo.local', name: 'Super Admin', roleKey: 'super_admin', password: process.env.SEED_SUPER_ADMIN_PASSWORD ?? 'ChangeMe!12345' },
  { email: 'finance@tavelo.local', name: 'Finance Admin', roleKey: 'finance_admin' },
  { email: 'support@tavelo.local', name: 'Support Admin', roleKey: 'support_admin' },
  { email: 'ops@tavelo.local', name: 'Operations Admin', roleKey: 'operations_admin' },
  { email: 'platform@tavelo.local', name: 'Platform Admin', roleKey: 'platform_admin' },
];

const FEATURES = ['PMS','BOOKING_ENGINE','CHANNEL_MANAGER','HOUSEKEEPING','MAINTENANCE','PROCUREMENT','INVENTORY','RESTAURANT','ERP','CRM','ANALYTICS','API','OFFLINE_MODE'];

const PLANS = [
  { name: 'BASIC', description: 'Starter plan - 1 property', monthly: 400000, annual: 4000000, limit: 1, features: ['PMS','BOOKING_ENGINE','HOUSEKEEPING','ANALYTICS'] },
  { name: 'PRO', description: 'Pro plan - 3 properties', monthly: 800000, annual: 8000000, limit: 3, features: ['PMS','BOOKING_ENGINE','CHANNEL_MANAGER','HOUSEKEEPING','MAINTENANCE','RESTAURANT','CRM','ANALYTICS','API'] },
];

const SAMPLE_OWNERS = [
  { name: 'Rajesh Menon', email: 'rajesh@abchospitality.in', mobile: '9000000001', company: 'ABC Hospitality Pvt Ltd', city: 'Kochi', country: 'India', plan: 'PRO', property: 'Kochi Grand Hotel' },
  { name: 'Anita Deshpande', email: 'anita@sahyadriresorts.com', mobile: '9000000002', company: 'Sahyadri Resorts LLP', city: 'Pune', country: 'India', plan: 'BASIC', property: 'Sahyadri Valley Resort' },
  { name: 'Faisal Rahman', email: 'faisal@marinebay.co', mobile: '9000000003', company: 'Marine Bay Hotels', city: 'Dubai', country: 'UAE', plan: 'PRO', property: 'Marine Bay Downtown' },
];

// India states/districts reference (mirrors owner_app/assets/data/in_states_districts.json).
const LOCATIONS = {
  'Kerala': ['Thiruvananthapuram', 'Kollam', 'Pathanamthitta', 'Alappuzha', 'Kottayam', 'Idukki', 'Ernakulam', 'Thrissur', 'Palakkad', 'Malappuram', 'Kozhikode', 'Wayanad', 'Kannur', 'Kasaragod'],
  'Karnataka': ['Bengaluru Urban', 'Bengaluru Rural', 'Mysuru', 'Mangaluru (Dakshina Kannada)', 'Udupi', 'Belagavi', 'Hubballi-Dharwad', 'Kalaburagi', 'Ballari', 'Shivamogga', 'Tumakuru', 'Hassan'],
  'Goa': ['North Goa', 'South Goa'],
  'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli', 'Erode', 'Vellore', 'Thoothukudi', 'Kanyakumari'],
  'Maharashtra': ['Mumbai City', 'Mumbai Suburban', 'Pune', 'Nagpur', 'Nashik', 'Thane', 'Aurangabad', 'Solapur', 'Kolhapur', 'Ratnagiri'],
  'Telangana': ['Hyderabad', 'Rangareddy', 'Medchal-Malkajgiri', 'Warangal', 'Karimnagar', 'Khammam', 'Nizamabad'],
  'Delhi': ['New Delhi', 'Central Delhi', 'South Delhi', 'North Delhi', 'East Delhi', 'West Delhi'],
  'Rajasthan': ['Jaipur', 'Jodhpur', 'Udaipur', 'Ajmer', 'Bikaner', 'Kota', 'Jaisalmer', 'Alwar'],
};

const rand = (n) => {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789';
  let out = '';
  for (let i = 0; i < n; i++) out += chars[Math.floor(Math.random() * chars.length)];
  return out;
};

async function main() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error('DATABASE_URL required');
  const client = new pg.Client({
    connectionString: url,
    ssl: process.env.DATABASE_SSL === 'true' ? { rejectUnauthorized: false } : undefined,
  });
  await client.connect();
  try {
    console.log('[seed] permissions...');
    for (const p of PERMISSIONS) {
      await client.query(
        'INSERT INTO permissions (key, "group", description) VALUES ($1,$2,$3) ON CONFLICT (key) DO NOTHING',
        [p.key, p.group, p.description],
      );
    }

    console.log('[seed] roles...');
    for (const r of ROLES) {
      const { rows } = await client.query('SELECT id FROM roles WHERE key=$1', [r.key]);
      let roleId;
      if (rows.length) {
        roleId = rows[0].id;
        await client.query('UPDATE roles SET name=$1, description=$2, is_system=true, updated_at=now() WHERE id=$3', [r.name, r.description, roleId]);
      } else {
        const ins = await client.query('INSERT INTO roles (key,name,description,is_system) VALUES ($1,$2,$3,true) RETURNING id', [r.key, r.name, r.description]);
        roleId = ins.rows[0].id;
      }
      await client.query('DELETE FROM role_permissions WHERE role_id=$1', [roleId]);
      for (const perm of r.permissions) {
        await client.query('INSERT INTO role_permissions (role_id, permission_key) VALUES ($1,$2) ON CONFLICT DO NOTHING', [roleId, perm]);
      }
    }

    console.log('[seed] admins...');
    for (const a of ADMINS) {
      const email = a.email.toLowerCase();
      const { rows } = await client.query('SELECT id FROM admins WHERE email=$1', [email]);
      let id;
      if (rows.length) {
        id = rows[0].id;
      } else {
        const password = a.password ?? rand(20);
        const hash = await argon2.hash(password, { type: argon2.argon2id });
        const ins = await client.query('INSERT INTO admins (email,name,password_hash,status) VALUES ($1,$2,$3,\'Active\') RETURNING id', [email, a.name, hash]);
        id = ins.rows[0].id;
        console.log(`  created ${email} (password: ${a.password ? '<from env>' : password})`);
      }
      const roleRow = await client.query('SELECT id FROM roles WHERE key=$1', [a.roleKey]);
      if (roleRow.rows.length) {
        await client.query('INSERT INTO admin_roles (admin_id, role_id) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, roleRow.rows[0].id]);
      }
    }

    console.log('[seed] feature catalog...');
    for (const key of FEATURES) {
      await client.query('INSERT INTO features (key,name) VALUES ($1,$2) ON CONFLICT (key) DO NOTHING', [key, key.replace(/_/g, ' ')]);
    }

    console.log('[seed] plans...');
    const planIds = {};
    for (const p of PLANS) {
      const { rows } = await client.query('SELECT id FROM subscription_plans WHERE name=$1', [p.name]);
      let id;
      if (rows.length) {
        id = rows[0].id;
        await client.query('UPDATE subscription_plans SET description=$1, monthly_price=$2, annual_price=$3, property_limit=$4, updated_at=now() WHERE id=$5', [p.description, p.monthly, p.annual, p.limit, id]);
      } else {
        const ins = await client.query('INSERT INTO subscription_plans (name,description,monthly_price,annual_price,property_limit) VALUES ($1,$2,$3,$4,$5) RETURNING id', [p.name, p.description, p.monthly, p.annual, p.limit]);
        id = ins.rows[0].id;
      }
      planIds[p.name] = id;
      await client.query('DELETE FROM plan_features WHERE plan_id=$1', [id]);
      for (const f of p.features) {
        await client.query('INSERT INTO plan_features (plan_id, feature_key) VALUES ($1,$2) ON CONFLICT DO NOTHING', [id, f]);
      }
    }

    console.log('[seed] sample owners/properties/subscriptions...');
    for (const s of SAMPLE_OWNERS) {
      const email = s.email.toLowerCase();
      const { rows } = await client.query('SELECT id FROM owners WHERE email=$1', [email]);
      let ownerId;
      if (rows.length) {
        ownerId = rows[0].id;
        // Backfill mobile so OTP login is testable end-to-end.
        await client.query('UPDATE owners SET mobile=COALESCE(mobile,$1), status=\'ACTIVE\' WHERE id=$2', [s.mobile, ownerId]);
      } else {
        const ins = await client.query('INSERT INTO owners (name,email,mobile,company,city,country,status) VALUES ($1,$2,$3,$4,$5,$6,\'ACTIVE\') RETURNING id', [s.name, email, s.mobile, s.company, s.city, s.country]);
        ownerId = ins.rows[0].id;
      }
      const propRow = await client.query('SELECT id FROM properties WHERE owner_id=$1 LIMIT 1', [ownerId]);
      if (!propRow.rows.length) {
        const slug = s.property.toLowerCase().replace(/[^a-z0-9]+/g, '-') + '-' + rand(5).toLowerCase();
        await client.query('INSERT INTO properties (owner_id,name,slug,city,country,status,listing_status,room_count,listing_completeness) VALUES ($1,$2,$3,$4,$5,\'ACTIVE\',\'Published\',60,80)', [ownerId, s.property, slug, s.city, s.country]);
      }
      const planId = planIds[s.plan];
      if (planId) {
        const subRow = await client.query('SELECT id FROM subscriptions WHERE owner_id=$1 LIMIT 1', [ownerId]);
        if (!subRow.rows.length) {
          await client.query('INSERT INTO subscriptions (owner_id, plan_id, status, billing_cycle, starts_at, current_period_start, current_period_end) VALUES ($1,$2,\'ACTIVE\',\'ANNUAL\',now(),now(),now() + interval \'365 days\')', [ownerId, planId]);
        }
      }
    }

    console.log('[seed] location states/districts...');
    for (const [stateName, districts] of Object.entries(LOCATIONS)) {
      await client.query('INSERT INTO location_states (name) VALUES ($1) ON CONFLICT (name) DO NOTHING', [stateName]);
      const stateRow = await client.query('SELECT id FROM location_states WHERE name=$1', [stateName]);
      const stateId = stateRow.rows[0].id;
      for (const district of districts) {
        await client.query('INSERT INTO location_districts (state_id, name) VALUES ($1,$2) ON CONFLICT (state_id, name) DO NOTHING', [stateId, district]);
      }
    }

    console.log('[seed] complete.');
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[seed] failed:', err);
  process.exit(1);
});
