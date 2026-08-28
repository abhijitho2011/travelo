/** Shapes returned by the Tavelo admin API. */

export type Owner = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  company: string | null;
  gstNumber: string | null;
  address: Record<string, unknown> | null;
  city: string | null;
  country: string | null;
  status: string;
  createdAt: string;
  updatedAt: string;
  lastActiveAt: string | null;
};

export type OwnerOverview = {
  owner: Owner;
  propertiesCount: number;
  activeSubscription: {
    id: string;
    status: string;
    cycle: string;
    currentPeriodEnd: string | null;
    planName: string;
    monthlyPrice: number;
    annualPrice: number;
  } | null;
  mrrContribution: number;
  openTickets: number;
  lastActivity: string | null;
};

export type Property = {
  id: string;
  ownerId: string;
  owner: string | null;
  name: string;
  slug: string | null;
  status: string;
  starRating: number | null;
  category: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  timezone: string | null;
  roomCount: number | null;
  createdAt: string;
  updatedAt: string;
};

export type IntegrationConnection = {
  id: string;
  ownerId: string | null;
  propertyId: string | null;
  provider: string;
  status: string;
  lastSyncAt: string | null;
  errorCount: number | null;
  updatedAt: string;
};

export type PropertyOverview = {
  property: Property;
  integrations: IntegrationConnection[];
  listingScore: { overall: number; detail: { label: string; ok: boolean; weight: number }[] };
};

export type Plan = {
  id: string;
  name: string;
  description: string | null;
  limit: number;
  monthly: number;
  annual: number;
  currency: string;
  status: string;
  features: string[];
  subscribers: number;
};

export type PlanDetail = {
  id: string;
  name: string;
  description: string | null;
  monthlyPrice: number;
  annualPrice: number;
  propertyLimit: number;
  currency: string;
  status: string;
  features: string[];
};

export type Feature = {
  key: string;
  name: string;
  description: string | null;
  group?: string | null;
};

export type Subscription = {
  id: string;
  ownerId: string;
  owner: string | null;
  planId: string;
  plan: string;
  status: string;
  cycle: string;
  autoRenew: boolean;
  startsAt: string | null;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  propertyLimit: number;
  priceOverride: number | null;
  createdAt: string;
};

export type SubscriptionEvent = {
  id: string;
  subscriptionId: string;
  eventType: string;
  fromStatus: string | null;
  toStatus: string | null;
  reason: string | null;
  createdAt: string;
};

export type Payment = {
  id: string;
  ownerId: string | null;
  owner: string | null;
  invoiceId: string | null;
  provider: string | null;
  providerPaymentId: string | null;
  amount: number;
  currency: string;
  status: string;
  method: string | null;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
};

export type Refund = {
  id: string;
  paymentId: string;
  amount: number;
  reason: string | null;
  status: string;
  createdAt: string;
};

export type PaymentDetail = Payment & { refunds: Refund[] };

export type Invoice = {
  id: string;
  invoiceNumber: string;
  ownerId: string;
  owner: string | null;
  subscriptionId: string | null;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  subtotal: number;
  tax: number;
  discount: number;
  total: number;
  currency: string;
  status: string;
  issuedAt: string | null;
  paidAt: string | null;
  dueDate: string | null;
  createdAt: string;
};

export type SupportMessage = {
  id: string;
  ticketId: string;
  authorType: string;
  authorId: string | null;
  body: string;
  isInternalNote: boolean;
  createdAt: string;
};

export type Ticket = {
  id: string;
  ownerId: string | null;
  propertyId: string | null;
  owner: string | null;
  hotel: string | null;
  assigned: string;
  assignedAdminId: string | null;
  subject: string;
  category: string | null;
  priority: string;
  status: string;
  firstResponseAt: string | null;
  resolvedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type TicketDetail = Ticket & { messages: SupportMessage[] };

export type ImpersonationSession = {
  id: string;
  actorAdminId: string;
  targetUserType: string;
  targetUserId: string | null;
  targetOwnerId: string | null;
  targetPropertyId: string | null;
  reason: string;
  status: string;
  startedAt: string;
  endedAt: string | null;
};

export type Announcement = {
  id: string;
  title: string;
  message: string;
  audience: unknown;
  channels: unknown;
  priority: string | null;
  status: string;
  scheduledAt: string | null;
  expiresAt: string | null;
  publishedAt: string | null;
  createdAt: string;
};

export type AdminNotification = {
  id: string;
  adminId: string;
  category: string | null;
  title: string;
  body: string | null;
  link: string | null;
  readAt: string | null;
  createdAt: string;
};

export type NotificationTemplate = {
  id: string;
  templateKey: string;
  name: string;
  channel: string;
  subject: string | null;
  body: string;
  status: string;
  updatedAt: string;
};

export type BackgroundJob = {
  id: string;
  queue: string;
  name: string;
  state: string;
  attempts: number;
  error: string | null;
  scheduledFor: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  createdAt: string;
};

export type AuditLog = {
  id: string;
  ts: string;
  actor: string | null;
  actorId: string | null;
  role: string | null;
  action: string;
  entity: string;
  entityId: string | null;
  before: unknown;
  after: unknown;
  reason: string | null;
  ip: string | null;
  userAgent: string | null;
};

export type AdminUser = {
  id: string;
  email: string;
  name: string;
  status: string;
  mfa: string;
  role: string;
  roles: { key: string; name: string }[];
  lastLogin: string | null;
  lastLoginIp: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminSession = {
  id: string;
  adminId: string;
  ip: string | null;
  userAgent: string | null;
  createdAt: string;
  expiresAt: string | null;
  revokedAt: string | null;
};

export type Role = {
  id: string;
  key: string;
  name: string;
  description: string | null;
  isSystem: boolean;
  permissions: string[];
  adminCount?: number | undefined;
  createdAt: string;
  updatedAt: string;
};

export type Permission = { key: string; group: string; description: string | null };

export type AnalyticsOverview = {
  ownersTotal: number;
  ownersActive: number;
  propertiesTotal: number;
  rooms: number;
  subsActive: number;
  expiringSoon: number;
  mrr: number;
  arr: number;
  arpu: number;
};

export type StatusCount = { status: string; count: number };

export type RevenuePoint = {
  day: string;
  mrr: number;
  arr: number;
  arpu: number;
  newMrr: number;
  expansionMrr: number;
  churnedMrr: number;
  activeOwners: number;
  activeSubscriptions: number;
};

export type DashboardData = {
  overview: AnalyticsOverview;
  subscriptionHealth: StatusCount[];
  ownerBreakdown: StatusCount[];
  revenueSeries: RevenuePoint[];
};

export type Entitlements = {
  planFeatures: string[];
  overrides: {
    id: string;
    ownerId: string;
    featureKey: string;
    granted: boolean;
    reason: string | null;
    createdAt: string;
  }[];
  effective: string[];
  subscription: { planId: string; status: string } | null;
};

export type SearchResults = {
  owners?: { id: string; name: string; company: string | null; email: string }[] | undefined;
  properties?: { id: string; name: string; city: string | null }[] | undefined;
  invoices?: { id: string; invoiceNumber: string; total: number }[] | undefined;
  tickets?: { id: string; subject: string; status: string }[] | undefined;
};

export type HealthReport = {
  status: string;
  info?: Record<string, { status: string; [k: string]: unknown }> | undefined;
  error?: Record<string, { status: string; [k: string]: unknown }> | undefined;
  details?: Record<string, { status: string; [k: string]: unknown }> | undefined;
};

export type LocationState = { id: string; name: string; createdAt?: string };
export type LocationDistrict = { id: string; stateId: string; name: string; createdAt?: string };
