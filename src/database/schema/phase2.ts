import { sql } from 'drizzle-orm';
import {
  pgTable,
  uuid,
  varchar,
  timestamp,
  jsonb,
  integer,
  boolean,
  text,
  index,
  primaryKey,
  uniqueIndex,
  date,
} from 'drizzle-orm/pg-core';
import { admins } from './admins';

// ---------- Owners ----------
export const ownerStatusValues = [
  'PENDING',
  'ACTIVE',
  'SUSPENDED',
  'BLOCKED',
  'DEACTIVATED',
] as const;
export type OwnerStatus = (typeof ownerStatusValues)[number];

export const owners = pgTable(
  'owners',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    phone: varchar('phone', { length: 64 }),
    mobile: varchar('mobile', { length: 32 }),
    emailVerified: boolean('email_verified').notNull().default(false),
    company: varchar('company', { length: 255 }),
    gstNumber: varchar('gst_number', { length: 32 }),
    address: jsonb('address'),
    status: varchar('status', { length: 32 }).notNull().default('PENDING').$type<OwnerStatus>(),
    city: varchar('city', { length: 128 }),
    country: varchar('country', { length: 128 }),
    // Admin-managed location catalogue. The FK constraints live in SQL only:
    // location_states/location_districts are declared in ./owner.ts, which
    // already imports this file, so a Drizzle .references() here would be a
    // circular import.
    stateId: uuid('state_id'),
    districtId: uuid('district_id'),
    pinCode: varchar('pin_code', { length: 6 }),
    createdBy: uuid('created_by').references(() => admins.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    lastActiveAt: timestamp('last_active_at', { withTimezone: true }),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    statusIdx: index('owners_status_idx').on(t.status),
    emailIdx: index('owners_email_idx').on(t.email),
    stateIdx: index('owners_state_idx').on(t.stateId),
    districtIdx: index('owners_district_idx').on(t.districtId),
    nameTrgm: index('owners_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
    companyTrgm: index('owners_company_trgm_idx').using('gin', sql`${t.company} gin_trgm_ops`),
  }),
);

// ---------- Properties ----------
export const propertyStatusValues = [
  'DRAFT',
  'ACTIVE',
  'SUSPENDED',
  'INACTIVE',
  'ARCHIVED',
] as const;
export type PropertyStatus = (typeof propertyStatusValues)[number];

export const properties = pgTable(
  'properties',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => owners.id, { onDelete: 'cascade' }),
    name: varchar('name', { length: 255 }).notNull(),
    slug: varchar('slug', { length: 255 }).notNull().unique(),
    starRating: integer('star_rating'),
    category: varchar('category', { length: 64 }),
    city: varchar('city', { length: 128 }),
    state: varchar('state', { length: 128 }),
    country: varchar('country', { length: 128 }),
    timezone: varchar('timezone', { length: 64 }),
    status: varchar('status', { length: 32 }).notNull().default('DRAFT').$type<PropertyStatus>(),
    listingStatus: varchar('listing_status', { length: 32 }).notNull().default('Draft'),
    roomCount: integer('room_count').notNull().default(0),
    listingCompleteness: integer('listing_completeness').notNull().default(0),
    contact: jsonb('contact'),
    address: jsonb('address'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => ({
    ownerIdx: index('properties_owner_idx').on(t.ownerId),
    statusIdx: index('properties_status_idx').on(t.status),
    nameTrgm: index('properties_name_trgm_idx').using('gin', sql`${t.name} gin_trgm_ops`),
  }),
);

/**
 * Property photos. Only metadata lives here — the bytes go to the object store
 * (S3 bucket in production, the mounted volume under the local driver) and are
 * handed to clients as short-lived presigned URLs.
 */
export const propertyPhotos = pgTable(
  'property_photos',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    propertyId: uuid('property_id')
      .notNull()
      .references(() => properties.id, { onDelete: 'cascade' }),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => owners.id, { onDelete: 'cascade' }),
    /** Object-store key, e.g. properties/<propertyId>/<uuid>.jpg — never bytes. */
    storageKey: varchar('storage_key', { length: 512 }).notNull(),
    contentType: varchar('content_type', { length: 128 }).notNull(),
    sizeBytes: integer('size_bytes').notNull(),
    sortOrder: integer('sort_order').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    propertyIdx: index('property_photos_property_idx').on(t.propertyId),
    ownerIdx: index('property_photos_owner_idx').on(t.ownerId),
  }),
);

// ---------- Features & Plans ----------
export const features = pgTable('features', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  key: varchar('key', { length: 64 }).notNull().unique(),
  name: varchar('name', { length: 128 }).notNull(),
  description: text('description'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const planStatusValues = ['ACTIVE', 'ARCHIVED'] as const;
export type PlanStatus = (typeof planStatusValues)[number];

export const subscriptionPlans = pgTable('subscription_plans', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  name: varchar('name', { length: 128 }).notNull().unique(),
  description: text('description'),
  monthlyPrice: integer('monthly_price').notNull(), // paise, per month
  annualPrice: integer('annual_price').notNull(), // legacy; not used for period maths
  // Billing period length. The total charged for one period is
  // monthlyPrice * durationMonths — monthlyPrice stays the single source of truth.
  durationMonths: integer('duration_months').notNull().default(1),
  currency: varchar('currency', { length: 8 }).notNull().default('INR'),
  propertyLimit: integer('property_limit').notNull().default(1),
  status: varchar('status', { length: 16 }).notNull().default('ACTIVE').$type<PlanStatus>(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const planFeatures = pgTable(
  'plan_features',
  {
    planId: uuid('plan_id')
      .notNull()
      .references(() => subscriptionPlans.id, { onDelete: 'cascade' }),
    featureKey: varchar('feature_key', { length: 64 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ pk: primaryKey({ columns: [t.planId, t.featureKey] }) }),
);

// ---------- Subscriptions ----------
export const subscriptionStatusValues = [
  'TRIAL',
  'ACTIVE',
  'EXPIRING',
  'GRACE_PERIOD',
  'EXPIRED',
  'SUSPENDED',
  'CANCELLED',
] as const;
export type SubscriptionStatus = (typeof subscriptionStatusValues)[number];

export const billingCycleValues = ['MONTHLY', 'ANNUAL'] as const;
export type BillingCycle = (typeof billingCycleValues)[number];

export const subscriptions = pgTable(
  'subscriptions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => owners.id, { onDelete: 'cascade' }),
    planId: uuid('plan_id')
      .notNull()
      .references(() => subscriptionPlans.id, { onDelete: 'restrict' }),
    status: varchar('status', { length: 32 })
      .notNull()
      .default('TRIAL')
      .$type<SubscriptionStatus>(),
    billingCycle: varchar('billing_cycle', { length: 16 })
      .notNull()
      .default('MONTHLY')
      .$type<BillingCycle>(),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull().defaultNow(),
    currentPeriodStart: timestamp('current_period_start', { withTimezone: true }).notNull(),
    currentPeriodEnd: timestamp('current_period_end', { withTimezone: true }).notNull(),
    cancelAt: timestamp('cancel_at', { withTimezone: true }),
    propertyLimitOverride: integer('property_limit_override'),
    priceOverride: integer('price_override'),
    autoRenew: boolean('auto_renew').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index('subscriptions_owner_idx').on(t.ownerId),
    statusIdx: index('subscriptions_status_idx').on(t.status),
    endIdx: index('subscriptions_period_end_idx').on(t.currentPeriodEnd),
  }),
);

export const subscriptionEvents = pgTable(
  'subscription_events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 64 }).notNull(),
    actorAdminId: uuid('actor_admin_id').references(() => admins.id, { onDelete: 'set null' }),
    payload: jsonb('payload'),
    at: timestamp('at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ subIdx: index('sub_events_sub_idx').on(t.subscriptionId) }),
);

export const subscriptionExtensions = pgTable(
  'subscription_extensions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    subscriptionId: uuid('subscription_id')
      .notNull()
      .references(() => subscriptions.id, { onDelete: 'cascade' }),
    days: integer('days').notNull(),
    reason: text('reason'),
    actorAdminId: uuid('actor_admin_id').references(() => admins.id, { onDelete: 'set null' }),
    previousExpiry: timestamp('previous_expiry', { withTimezone: true }).notNull(),
    newExpiry: timestamp('new_expiry', { withTimezone: true }).notNull(),
    idempotencyKey: varchar('idempotency_key', { length: 128 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    idemUnique: uniqueIndex('sub_ext_idem_unique').on(t.subscriptionId, t.idempotencyKey),
  }),
);

// ---------- Entitlements ----------
export const ownerFeatureOverrides = pgTable(
  'owner_feature_overrides',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => owners.id, { onDelete: 'cascade' }),
    featureKey: varchar('feature_key', { length: 64 }).notNull(),
    granted: boolean('granted').notNull().default(true),
    reason: text('reason'),
    createdBy: uuid('created_by').references(() => admins.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index('owner_feature_overrides_owner_idx').on(t.ownerId),
    uniq: uniqueIndex('owner_feature_overrides_unique').on(t.ownerId, t.featureKey),
  }),
);

// ---------- Payments / Invoices ----------
export const paymentGatewayValues = ['RAZORPAY', 'CASHFREE', 'MANUAL', 'STRIPE'] as const;
export const paymentStatusValues = [
  'PENDING',
  'SUCCESS',
  'FAILED',
  'REFUNDED',
  'PARTIALLY_REFUNDED',
  'CANCELLED',
] as const;
export type PaymentStatus = (typeof paymentStatusValues)[number];

export const invoices = pgTable(
  'invoices',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    invoiceNumber: varchar('invoice_number', { length: 32 }).notNull().unique(),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => owners.id, { onDelete: 'restrict' }),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, {
      onDelete: 'set null',
    }),
    billingPeriodStart: timestamp('billing_period_start', { withTimezone: true }).notNull(),
    billingPeriodEnd: timestamp('billing_period_end', { withTimezone: true }).notNull(),
    subtotal: integer('subtotal').notNull(),
    tax: integer('tax').notNull().default(0),
    discount: integer('discount').notNull().default(0),
    total: integer('total').notNull(),
    currency: varchar('currency', { length: 8 }).notNull().default('INR'),
    status: varchar('status', { length: 32 }).notNull().default('DRAFT'),
    dueDate: timestamp('due_date', { withTimezone: true }),
    issuedAt: timestamp('issued_at', { withTimezone: true }),
    paidAt: timestamp('paid_at', { withTimezone: true }),
    pdfUrl: text('pdf_url'),
    /** Object-store key of the invoice document, when one has been generated. */
    storageKey: varchar('storage_key', { length: 512 }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index('invoices_owner_idx').on(t.ownerId),
    statusIdx: index('invoices_status_idx').on(t.status),
  }),
);

export const invoiceSequences = pgTable('invoice_sequences', {
  yearMonth: varchar('year_month', { length: 6 }).primaryKey(),
  lastSeq: integer('last_seq').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

export const payments = pgTable(
  'payments',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ownerId: uuid('owner_id')
      .notNull()
      .references(() => owners.id, { onDelete: 'restrict' }),
    subscriptionId: uuid('subscription_id').references(() => subscriptions.id, {
      onDelete: 'set null',
    }),
    invoiceId: uuid('invoice_id').references(() => invoices.id, { onDelete: 'set null' }),
    gateway: varchar('gateway', { length: 32 }).notNull(),
    gatewayRef: varchar('gateway_ref', { length: 128 }),
    amount: integer('amount').notNull(),
    currency: varchar('currency', { length: 8 }).notNull().default('INR'),
    status: varchar('status', { length: 32 }).notNull().default('PENDING').$type<PaymentStatus>(),
    method: varchar('method', { length: 64 }),
    capturedAt: timestamp('captured_at', { withTimezone: true }),
    raw: jsonb('raw'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index('payments_owner_idx').on(t.ownerId),
    statusIdx: index('payments_status_idx').on(t.status),
    gatewayRefIdx: index('payments_gateway_ref_idx').on(t.gateway, t.gatewayRef),
  }),
);

export const refunds = pgTable(
  'refunds',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    paymentId: uuid('payment_id')
      .notNull()
      .references(() => payments.id, { onDelete: 'cascade' }),
    amount: integer('amount').notNull(),
    reason: text('reason'),
    gatewayRef: varchar('gateway_ref', { length: 128 }),
    status: varchar('status', { length: 32 }).notNull().default('PENDING'),
    createdBy: uuid('created_by').references(() => admins.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ paymentIdx: index('refunds_payment_idx').on(t.paymentId) }),
);

export const webhookEvents = pgTable(
  'webhook_events',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    provider: varchar('provider', { length: 32 }).notNull(),
    eventId: varchar('event_id', { length: 128 }).notNull(),
    eventType: varchar('event_type', { length: 128 }),
    payload: jsonb('payload'),
    receivedAt: timestamp('received_at', { withTimezone: true }).notNull().defaultNow(),
    processedAt: timestamp('processed_at', { withTimezone: true }),
    error: text('error'),
  },
  (t) => ({
    uniq: uniqueIndex('webhook_events_unique').on(t.provider, t.eventId),
  }),
);

// ---------- Analytics ----------
export const dailyPlatformMetrics = pgTable('daily_platform_metrics', {
  day: date('day').primaryKey(),
  mrr: integer('mrr').notNull().default(0),
  arr: integer('arr').notNull().default(0),
  arpu: integer('arpu').notNull().default(0),
  newMrr: integer('new_mrr').notNull().default(0),
  expansionMrr: integer('expansion_mrr').notNull().default(0),
  churnedMrr: integer('churned_mrr').notNull().default(0),
  activeOwners: integer('active_owners').notNull().default(0),
  activeSubscriptions: integer('active_subscriptions').notNull().default(0),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Support ----------
export const ticketPriorityValues = ['LOW', 'NORMAL', 'HIGH', 'CRITICAL'] as const;
export const ticketStatusValues = [
  'OPEN',
  'IN_PROGRESS',
  'WAITING_FOR_OWNER',
  'RESOLVED',
  'CLOSED',
] as const;

export const supportTickets = pgTable(
  'support_tickets',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ownerId: uuid('owner_id').references(() => owners.id, { onDelete: 'set null' }),
    propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'set null' }),
    subject: varchar('subject', { length: 255 }).notNull(),
    category: varchar('category', { length: 64 }),
    priority: varchar('priority', { length: 16 }).notNull().default('NORMAL'),
    status: varchar('status', { length: 32 }).notNull().default('OPEN'),
    assignedAdminId: uuid('assigned_admin_id').references(() => admins.id, {
      onDelete: 'set null',
    }),
    openedByHotelUserId: uuid('opened_by_hotel_user_id'),
    firstResponseAt: timestamp('first_response_at', { withTimezone: true }),
    resolvedAt: timestamp('resolved_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index('tickets_owner_idx').on(t.ownerId),
    statusIdx: index('tickets_status_idx').on(t.status),
    subjectTrgm: index('tickets_subject_trgm_idx').using('gin', sql`${t.subject} gin_trgm_ops`),
  }),
);

export const supportMessages = pgTable(
  'support_messages',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ticketId: uuid('ticket_id')
      .notNull()
      .references(() => supportTickets.id, { onDelete: 'cascade' }),
    authorType: varchar('author_type', { length: 16 }).notNull(),
    authorId: uuid('author_id'),
    body: text('body').notNull(),
    isInternalNote: boolean('is_internal_note').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ ticketIdx: index('sup_msg_ticket_idx').on(t.ticketId) }),
);

export const supportAttachments = pgTable('support_attachments', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  messageId: uuid('message_id')
    .notNull()
    .references(() => supportMessages.id, { onDelete: 'cascade' }),
  filename: varchar('filename', { length: 255 }).notNull(),
  url: text('url').notNull(),
  mimeType: varchar('mime_type', { length: 128 }),
  size: integer('size'),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Impersonation ----------
export const impersonationSessions = pgTable(
  'impersonation_sessions',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    actorAdminId: uuid('actor_admin_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'restrict' }),
    targetUserType: varchar('target_user_type', { length: 32 }).notNull(),
    targetUserId: uuid('target_user_id'),
    targetOwnerId: uuid('target_owner_id').references(() => owners.id, { onDelete: 'set null' }),
    targetPropertyId: uuid('target_property_id').references(() => properties.id, {
      onDelete: 'set null',
    }),
    reason: text('reason').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    endedAt: timestamp('ended_at', { withTimezone: true }),
    status: varchar('status', { length: 16 }).notNull().default('ACTIVE'),
    ip: varchar('ip', { length: 64 }),
    userAgent: varchar('user_agent', { length: 512 }),
    tokenJti: varchar('token_jti', { length: 128 }),
  },
  (t) => ({
    actorIdx: index('imp_actor_idx').on(t.actorAdminId),
    statusIdx: index('imp_status_idx').on(t.status),
  }),
);

// ---------- Announcements ----------
export const announcements = pgTable(
  'announcements',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    title: varchar('title', { length: 255 }).notNull(),
    message: text('message').notNull(),
    audience: jsonb('audience').notNull(),
    channels: jsonb('channels'),
    priority: varchar('priority', { length: 16 }).notNull().default('NORMAL'),
    status: varchar('status', { length: 16 }).notNull().default('DRAFT'),
    scheduledAt: timestamp('scheduled_at', { withTimezone: true }),
    publishedAt: timestamp('published_at', { withTimezone: true }),
    expiresAt: timestamp('expires_at', { withTimezone: true }),
    createdBy: uuid('created_by').references(() => admins.id, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ statusIdx: index('announcements_status_idx').on(t.status) }),
);

// ---------- Notifications ----------
export const notifications = pgTable(
  'notifications',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    adminId: uuid('admin_id')
      .notNull()
      .references(() => admins.id, { onDelete: 'cascade' }),
    type: varchar('type', { length: 64 }).notNull(),
    tone: varchar('tone', { length: 16 }).notNull().default('info'),
    title: varchar('title', { length: 255 }).notNull(),
    body: text('body'),
    meta: jsonb('meta'),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({ adminIdx: index('notifications_admin_idx').on(t.adminId, t.readAt) }),
);

export const notificationTemplates = pgTable('notification_templates', {
  id: uuid('id')
    .primaryKey()
    .default(sql`gen_random_uuid()`),
  templateKey: varchar('template_key', { length: 128 }).notNull().unique(),
  name: varchar('name', { length: 255 }).notNull(),
  channel: varchar('channel', { length: 32 }).notNull(),
  subject: varchar('subject', { length: 255 }),
  body: text('body').notNull(),
  status: varchar('status', { length: 16 }).notNull().default('Active'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

// ---------- Integrations ----------
export const integrationConnections = pgTable(
  'integration_connections',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    ownerId: uuid('owner_id').references(() => owners.id, { onDelete: 'cascade' }),
    propertyId: uuid('property_id').references(() => properties.id, { onDelete: 'cascade' }),
    provider: varchar('provider', { length: 64 }).notNull(),
    scope: varchar('scope', { length: 128 }),
    status: varchar('status', { length: 32 }).notNull().default('HEALTHY'),
    lastSyncAt: timestamp('last_sync_at', { withTimezone: true }),
    lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
    lastFailureAt: timestamp('last_failure_at', { withTimezone: true }),
    errorCount: integer('error_count').notNull().default(0),
    detail: text('detail'),
    config: jsonb('config'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    ownerIdx: index('integrations_owner_idx').on(t.ownerId),
    statusIdx: index('integrations_status_idx').on(t.status),
  }),
);

// ---------- Background Jobs mirror ----------
export const backgroundJobs = pgTable(
  'background_jobs',
  {
    id: uuid('id')
      .primaryKey()
      .default(sql`gen_random_uuid()`),
    name: varchar('name', { length: 255 }).notNull(),
    queue: varchar('queue', { length: 64 }).notNull(),
    state: varchar('state', { length: 32 }).notNull().default('Pending'),
    payload: jsonb('payload'),
    attempts: integer('attempts').notNull().default(0),
    runtimeMs: integer('runtime_ms'),
    error: text('error'),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => ({
    queueIdx: index('jobs_queue_idx').on(t.queue),
    stateIdx: index('jobs_state_idx').on(t.state),
  }),
);

export type Owner = typeof owners.$inferSelect;
export type Property = typeof properties.$inferSelect;
export type SubscriptionPlan = typeof subscriptionPlans.$inferSelect;
export type Subscription = typeof subscriptions.$inferSelect;
export type Invoice = typeof invoices.$inferSelect;
export type Payment = typeof payments.$inferSelect;
export type SupportTicket = typeof supportTickets.$inferSelect;
