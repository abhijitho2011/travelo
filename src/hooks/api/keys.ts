/** Central query-key factory so mutations can invalidate precisely. */
export const qk = {
  dashboard: ["dashboard"] as const,
  analytics: {
    overview: ["analytics", "overview"] as const,
    subscriptions: ["analytics", "subscriptions"] as const,
    owners: ["analytics", "owners"] as const,
    revenue: (from?: string, to?: string) => ["analytics", "revenue", from ?? null, to ?? null] as const,
  },
  owners: {
    all: ["owners"] as const,
    list: (params: unknown) => ["owners", "list", params] as const,
    detail: (id: string) => ["owners", "detail", id] as const,
    overview: (id: string) => ["owners", "overview", id] as const,
    properties: (id: string) => ["owners", "properties", id] as const,
    entitlements: (id: string) => ["owners", "entitlements", id] as const,
  },
  properties: {
    all: ["properties"] as const,
    list: (params: unknown) => ["properties", "list", params] as const,
    detail: (id: string) => ["properties", "detail", id] as const,
    overview: (id: string) => ["properties", "overview", id] as const,
    integrations: (id: string) => ["properties", "integrations", id] as const,
  },
  plans: {
    all: ["plans"] as const,
    list: ["plans", "list"] as const,
    features: ["plans", "features"] as const,
    detail: (id: string) => ["plans", "detail", id] as const,
  },
  subscriptions: {
    all: ["subscriptions"] as const,
    list: (params: unknown) => ["subscriptions", "list", params] as const,
    detail: (id: string) => ["subscriptions", "detail", id] as const,
    events: (id: string) => ["subscriptions", "events", id] as const,
  },
  billing: {
    all: ["billing"] as const,
    payments: (params: unknown) => ["billing", "payments", params] as const,
    payment: (id: string) => ["billing", "payment", id] as const,
    failed: (limit: number) => ["billing", "failed", limit] as const,
    refunds: (params: unknown) => ["billing", "refunds", params] as const,
    invoices: (params: unknown) => ["billing", "invoices", params] as const,
    invoice: (id: string) => ["billing", "invoice", id] as const,
  },
  support: {
    all: ["support"] as const,
    list: (params: unknown) => ["support", "list", params] as const,
    detail: (id: string) => ["support", "detail", id] as const,
  },
  impersonation: {
    all: ["impersonation"] as const,
    history: (params: unknown) => ["impersonation", "history", params] as const,
    detail: (id: string) => ["impersonation", "detail", id] as const,
  },
  announcements: {
    all: ["announcements"] as const,
    list: (params: unknown) => ["announcements", "list", params] as const,
    detail: (id: string) => ["announcements", "detail", id] as const,
  },
  notifications: {
    all: ["notifications"] as const,
    list: (params: unknown) => ["notifications", "list", params] as const,
    templates: ["notifications", "templates"] as const,
  },
  integrations: {
    all: ["integrations"] as const,
    list: (params: unknown) => ["integrations", "list", params] as const,
    detail: (id: string) => ["integrations", "detail", id] as const,
  },
  jobs: {
    all: ["jobs"] as const,
    list: (params: unknown) => ["jobs", "list", params] as const,
    detail: (id: string) => ["jobs", "detail", id] as const,
  },
  audit: {
    all: ["audit-logs"] as const,
    list: (params: unknown) => ["audit-logs", "list", params] as const,
  },
  adminUsers: {
    all: ["admin-users"] as const,
    list: (params: unknown) => ["admin-users", "list", params] as const,
    detail: (id: string) => ["admin-users", "detail", id] as const,
    sessions: (id: string) => ["admin-users", "sessions", id] as const,
  },
  roles: {
    all: ["roles"] as const,
    list: ["roles", "list"] as const,
    detail: (id: string) => ["roles", "detail", id] as const,
  },
  permissions: ["permissions"] as const,
  search: (q: string, types?: string) => ["search", q, types ?? null] as const,
  health: ["health"] as const,
  locations: {
    all: ["locations"] as const,
    states: ["locations", "states"] as const,
    districts: (stateId: string) => ["locations", "districts", stateId] as const,
  },
} as const;
