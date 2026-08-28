/**
 * Demo dataset for the Travelo Super Admin control plane.
 * Pure front-end fixtures — no backend calls.
 */

export type StatusTone = "success" | "warning" | "danger" | "neutral" | "info";

export const statusTone: Record<string, StatusTone> = {
  Active: "success",
  Healthy: "success",
  Approved: "success",
  Successful: "success",
  Paid: "success",
  Published: "success",
  Resolved: "success",
  Connected: "success",
  Completed: "success",
  Online: "success",
  Trial: "info",
  "In Progress": "info",
  Processing: "info",
  Open: "info",
  Expiring: "warning",
  "Expiring Soon": "warning",
  Pending: "warning",
  Degraded: "warning",
  Warning: "warning",
  "Grace Period": "warning",
  "Waiting for Owner": "warning",
  Unpublished: "warning",
  Retried: "warning",
  Expired: "danger",
  Suspended: "danger",
  Failed: "danger",
  Critical: "danger",
  Down: "danger",
  Error: "danger",
  Disconnected: "danger",
  Overdue: "danger",
  Blocked: "danger",
  Draft: "neutral",
  Inactive: "neutral",
  Archived: "neutral",
  Cancelled: "neutral",
  Closed: "neutral",
  Refunded: "neutral",
};

export const inr = (value: number) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 0,
  }).format(value);

export const num = (value: number) => new Intl.NumberFormat("en-IN").format(value);

export const kpis = [
  { label: "Total Owners", value: "184", delta: "+12", trend: "up", hint: "vs last 30 days" },
  { label: "Active Owners", value: "167", delta: "+9", trend: "up", hint: "90.7% of base" },
  { label: "Total Properties", value: "612", delta: "+31", trend: "up", hint: "3★ & 4★" },
  { label: "Total Rooms", value: "48,204", delta: "+1,940", trend: "up", hint: "managed inventory" },
  { label: "Active Subscriptions", value: "171", delta: "+7", trend: "up", hint: "incl. 12 trials" },
  { label: "MRR", value: "₹42.6L", delta: "+6.4%", trend: "up", hint: "net of churn" },
  { label: "ARR", value: "₹5.11Cr", delta: "+18.2%", trend: "up", hint: "annualised" },
  { label: "Expiring Soon", value: "14", delta: "7 days", trend: "down", hint: "needs outreach" },
];

export const revenueSeries = [
  { month: "Sep", mrr: 3180000, arr: 38160000, collected: 3020000 },
  { month: "Oct", mrr: 3320000, arr: 39840000, collected: 3260000 },
  { month: "Nov", mrr: 3505000, arr: 42060000, collected: 3410000 },
  { month: "Dec", mrr: 3690000, arr: 44280000, collected: 3600000 },
  { month: "Jan", mrr: 3840000, arr: 46080000, collected: 3790000 },
  { month: "Feb", mrr: 3960000, arr: 47520000, collected: 3880000 },
  { month: "Mar", mrr: 4090000, arr: 49080000, collected: 4010000 },
  { month: "Apr", mrr: 4180000, arr: 50160000, collected: 4120000 },
  { month: "May", mrr: 4260000, arr: 51120000, collected: 4190000 },
];

export const growthSeries = [
  { month: "Jan", owners: 11, properties: 24, churned: 2 },
  { month: "Feb", owners: 9, properties: 19, churned: 3 },
  { month: "Mar", owners: 14, properties: 33, churned: 1 },
  { month: "Apr", owners: 12, properties: 28, churned: 2 },
  { month: "May", owners: 16, properties: 41, churned: 2 },
  { month: "Jun", owners: 12, properties: 31, churned: 4 },
];

export const subscriptionHealth = [
  { label: "Active", value: 137, tone: "success" as StatusTone },
  { label: "Trial", value: 12, tone: "info" as StatusTone },
  { label: "Expiring", value: 14, tone: "warning" as StatusTone },
  { label: "Grace Period", value: 6, tone: "warning" as StatusTone },
  { label: "Expired", value: 8, tone: "danger" as StatusTone },
  { label: "Suspended", value: 4, tone: "danger" as StatusTone },
  { label: "Cancelled", value: 3, tone: "neutral" as StatusTone },
];

export const platformUsage = [
  { label: "Total reservations", value: "1,284,910", sub: "all time" },
  { label: "Today's check-ins", value: "3,412", sub: "across 612 properties" },
  { label: "Today's check-outs", value: "3,187", sub: "live" },
  { label: "Active users", value: "9,684", sub: "last 24h" },
  { label: "API requests", value: "12.4M", sub: "last 24h" },
  { label: "Channel syncs", value: "84,220", sub: "last 24h · 99.2% ok" },
  { label: "Notifications", value: "241,908", sub: "sent today" },
  { label: "Storage", value: "8.7 TB", sub: "of 20 TB" },
];

export const alerts = [
  { tone: "danger", text: "3 payment failures in the last 24 hours", to: "/payments" },
  { tone: "danger", text: "2 channel integrations offline", to: "/integrations" },
  { tone: "warning", text: "14 subscriptions expiring within 7 days", to: "/subscriptions" },
  { tone: "warning", text: "8 failed background jobs", to: "/jobs" },
  { tone: "success", text: "All core systems operational", to: "/system-health" },
] as const;

export type Owner = {
  id: string;
  name: string;
  company: string;
  email: string;
  phone: string;
  city: string;
  country: string;
  properties: number;
  rooms: number;
  staff: number;
  plan: string;
  mrr: number;
  subscription: string;
  expiry: string;
  status: string;
  lastActive: string;
  registered: string;
};

export const owners: Owner[] = [
  { id: "OWN-1042", name: "Rajesh Menon", company: "ABC Hospitality Pvt Ltd", email: "rajesh@abchospitality.in", phone: "+91 98470 11234", city: "Kochi", country: "India", properties: 4, rooms: 312, staff: 87, plan: "Growth", mrr: 100000, subscription: "Annual", expiry: "30 Sep 2026", status: "Active", lastActive: "12 min ago", registered: "14 Mar 2024" },
  { id: "OWN-1043", name: "Anita Deshpande", company: "Sahyadri Resorts LLP", email: "anita@sahyadriresorts.com", phone: "+91 98220 44120", city: "Pune", country: "India", properties: 2, rooms: 148, staff: 41, plan: "Standard", mrr: 45000, subscription: "Monthly", expiry: "08 Sep 2026", status: "Expiring", lastActive: "2 hours ago", registered: "02 Jul 2024" },
  { id: "OWN-1044", name: "Faisal Rahman", company: "Marine Bay Hotels", email: "faisal@marinebay.co", phone: "+971 50 774 2210", city: "Dubai", country: "UAE", properties: 6, rooms: 540, staff: 162, plan: "Enterprise", mrr: 185000, subscription: "Annual", expiry: "18 Feb 2027", status: "Active", lastActive: "38 min ago", registered: "21 Nov 2023" },
  { id: "OWN-1045", name: "Priya Nair", company: "Backwater Collection", email: "priya@backwatercollection.in", phone: "+91 94470 88210", city: "Alappuzha", country: "India", properties: 3, rooms: 96, staff: 34, plan: "Standard", mrr: 45000, subscription: "Monthly", expiry: "29 Aug 2026", status: "Grace Period", lastActive: "3 days ago", registered: "09 Jan 2025" },
  { id: "OWN-1046", name: "Vikram Singh", company: "Aravalli Grand Hotels", email: "vikram@aravalligrand.com", phone: "+91 99100 32109", city: "Jaipur", country: "India", properties: 5, rooms: 428, staff: 121, plan: "Growth", mrr: 100000, subscription: "Annual", expiry: "11 Dec 2026", status: "Active", lastActive: "1 hour ago", registered: "30 May 2024" },
  { id: "OWN-1047", name: "Meera Krishnan", company: "Nilgiri Stay Co.", email: "meera@nilgiristay.in", phone: "+91 90030 55871", city: "Ooty", country: "India", properties: 1, rooms: 42, staff: 16, plan: "Starter", mrr: 18000, subscription: "Monthly", expiry: "04 Sep 2026", status: "Trial", lastActive: "yesterday", registered: "12 Aug 2026" },
  { id: "OWN-1048", name: "Joseph Fernandes", company: "Coastline Retreats", email: "joseph@coastlineretreats.com", phone: "+91 98600 20034", city: "Goa", country: "India", properties: 2, rooms: 110, staff: 39, plan: "Standard", mrr: 45000, subscription: "Monthly", expiry: "19 Jul 2026", status: "Expired", lastActive: "22 days ago", registered: "18 Feb 2024" },
  { id: "OWN-1049", name: "Sunita Agarwal", company: "Ganges View Hospitality", email: "sunita@gangesview.in", phone: "+91 93350 71120", city: "Varanasi", country: "India", properties: 2, rooms: 88, staff: 28, plan: "Standard", mrr: 45000, subscription: "Annual", expiry: "27 Mar 2027", status: "Active", lastActive: "5 hours ago", registered: "27 Mar 2024" },
  { id: "OWN-1050", name: "Arun Prakash", company: "Deccan Suites Group", email: "arun@deccansuites.com", phone: "+91 89390 60012", city: "Hyderabad", country: "India", properties: 3, rooms: 204, staff: 63, plan: "Growth", mrr: 100000, subscription: "Annual", expiry: "05 Oct 2026", status: "Suspended", lastActive: "9 days ago", registered: "05 Oct 2023" },
  { id: "OWN-1051", name: "Lakshmi Iyer", company: "Temple Town Hotels", email: "lakshmi@templetown.in", phone: "+91 97890 21456", city: "Madurai", country: "India", properties: 2, rooms: 124, staff: 44, plan: "Standard", mrr: 45000, subscription: "Monthly", expiry: "02 Sep 2026", status: "Expiring", lastActive: "4 hours ago", registered: "16 Jun 2024" },
];

export type Property = {
  id: string;
  name: string;
  ownerId: string;
  owner: string;
  location: string;
  category: string;
  stars: 3 | 4;
  rooms: number;
  occupancy: number;
  revenue: number;
  gm: string;
  agm: string;
  status: string;
  listing: string;
  completeness: number;
  updated: string;
};

export const properties: Property[] = [
  { id: "PRP-3301", name: "Kochi Grand Hotel", ownerId: "OWN-1042", owner: "ABC Hospitality Pvt Ltd", location: "Kochi, Kerala", category: "City Hotel", stars: 4, rooms: 124, occupancy: 82, revenue: 4820000, gm: "Sandeep Varma", agm: "Reena Thomas", status: "Active", listing: "Published", completeness: 92, updated: "2 hours ago" },
  { id: "PRP-3302", name: "Marari Beach Resort", ownerId: "OWN-1042", owner: "ABC Hospitality Pvt Ltd", location: "Alappuzha, Kerala", category: "Resort", stars: 4, rooms: 86, occupancy: 74, revenue: 3110000, gm: "Nikhil Joseph", agm: "Asha Pillai", status: "Active", listing: "Published", completeness: 88, updated: "yesterday" },
  { id: "PRP-3303", name: "Munnar Hill Retreat", ownerId: "OWN-1042", owner: "ABC Hospitality Pvt Ltd", location: "Munnar, Kerala", category: "Resort", stars: 3, rooms: 58, occupancy: 61, revenue: 1420000, gm: "Tony Mathew", agm: "—", status: "Active", listing: "Unpublished", completeness: 64, updated: "4 days ago" },
  { id: "PRP-3304", name: "Trivandrum Business Inn", ownerId: "OWN-1042", owner: "ABC Hospitality Pvt Ltd", location: "Trivandrum, Kerala", category: "City Hotel", stars: 3, rooms: 44, occupancy: 69, revenue: 980000, gm: "Divya Nair", agm: "—", status: "Active", listing: "Draft", completeness: 41, updated: "1 week ago" },
  { id: "PRP-3310", name: "Sahyadri Valley Resort", ownerId: "OWN-1043", owner: "Sahyadri Resorts LLP", location: "Lonavala, Maharashtra", category: "Resort", stars: 4, rooms: 92, occupancy: 77, revenue: 2740000, gm: "Kiran Patil", agm: "Neha Kulkarni", status: "Active", listing: "Published", completeness: 95, updated: "6 hours ago" },
  { id: "PRP-3320", name: "Marine Bay Downtown", ownerId: "OWN-1044", owner: "Marine Bay Hotels", location: "Dubai Marina, UAE", category: "City Hotel", stars: 4, rooms: 210, occupancy: 88, revenue: 9640000, gm: "Omar Haddad", agm: "Layla Aziz", status: "Active", listing: "Published", completeness: 98, updated: "35 min ago" },
  { id: "PRP-3321", name: "Marine Bay Creekside", ownerId: "OWN-1044", owner: "Marine Bay Hotels", location: "Deira, UAE", category: "City Hotel", stars: 3, rooms: 128, occupancy: 71, revenue: 4180000, gm: "Yusuf Khan", agm: "Sara Noor", status: "Active", listing: "Published", completeness: 90, updated: "3 hours ago" },
  { id: "PRP-3330", name: "Aravalli Palace Jaipur", ownerId: "OWN-1046", owner: "Aravalli Grand Hotels", location: "Jaipur, Rajasthan", category: "Heritage", stars: 4, rooms: 168, occupancy: 79, revenue: 6320000, gm: "Mahendra Rathore", agm: "Pooja Sharma", status: "Active", listing: "Published", completeness: 86, updated: "yesterday" },
  { id: "PRP-3340", name: "Coastline Palm Grove", ownerId: "OWN-1048", owner: "Coastline Retreats", location: "Candolim, Goa", category: "Resort", stars: 3, rooms: 64, occupancy: 0, revenue: 0, gm: "Ryan Dsouza", agm: "—", status: "Suspended", listing: "Unpublished", completeness: 72, updated: "22 days ago" },
  { id: "PRP-3350", name: "Deccan Suites Gachibowli", ownerId: "OWN-1050", owner: "Deccan Suites Group", location: "Hyderabad, Telangana", category: "City Hotel", stars: 4, rooms: 96, occupancy: 0, revenue: 0, gm: "Ravi Teja", agm: "Anjali Rao", status: "Suspended", listing: "Unpublished", completeness: 81, updated: "9 days ago" },
];

export const plans = [
  { id: "PLN-01", name: "Starter", limit: 1, monthly: 18000, annual: 180000, subscribers: 38, status: "Active", features: ["PMS", "Booking Engine", "Housekeeping", "Analytics"] },
  { id: "PLN-02", name: "Standard", limit: 2, monthly: 45000, annual: 450000, subscribers: 71, status: "Active", features: ["PMS", "Booking Engine", "Channel Manager", "Housekeeping", "Maintenance", "Restaurant", "Analytics"] },
  { id: "PLN-03", name: "Growth", limit: 5, monthly: 100000, annual: 1000000, subscribers: 46, status: "Active", features: ["PMS", "Booking Engine", "Channel Manager", "Housekeeping", "Maintenance", "Procurement", "Inventory", "Restaurant", "CRM", "Analytics", "API"] },
  { id: "PLN-04", name: "Enterprise", limit: 25, monthly: 185000, annual: 1850000, subscribers: 16, status: "Active", features: ["All modules", "ERP", "Offline Mode", "API", "Dedicated success manager"] },
  { id: "PLN-05", name: "Legacy Pro", limit: 3, monthly: 60000, annual: 600000, subscribers: 0, status: "Inactive", features: ["PMS", "Booking Engine", "Channel Manager"] },
];

export const entitlements = [
  "PMS", "Booking Engine", "Channel Manager", "Housekeeping", "Maintenance",
  "Procurement", "Inventory", "Restaurant / F&B", "Kitchen", "ERP / Accounts",
  "Sales CRM", "Spa", "Events", "Travel Desk", "Security", "Analytics",
  "Digital Check-in", "Key-card Management", "API Access", "Offline Mode",
];

export const subscriptions = owners.map((o, i) => ({
  id: `SUB-${9100 + i}`,
  ownerId: o.id,
  owner: o.company,
  plan: o.plan,
  properties: o.properties,
  mrr: o.mrr,
  cycle: o.subscription,
  start: o.registered,
  expiry: o.expiry,
  status: o.status === "Active" ? "Active" : o.status,
  autoRenew: !["Expired", "Suspended"].includes(o.status),
}));

export const payments = [
  { id: "PAY-88421", ownerId: "OWN-1044", owner: "Marine Bay Hotels", amount: 1850000, plan: "Enterprise", method: "Bank transfer", date: "18 Aug 2026", status: "Successful" },
  { id: "PAY-88420", ownerId: "OWN-1042", owner: "ABC Hospitality Pvt Ltd", amount: 1000000, plan: "Growth", method: "Card •••• 4421", date: "17 Aug 2026", status: "Successful" },
  { id: "PAY-88419", ownerId: "OWN-1048", owner: "Coastline Retreats", amount: 45000, plan: "Standard", method: "Card •••• 9012", date: "16 Aug 2026", status: "Failed" },
  { id: "PAY-88418", ownerId: "OWN-1045", owner: "Backwater Collection", amount: 45000, plan: "Standard", method: "UPI", date: "15 Aug 2026", status: "Pending" },
  { id: "PAY-88417", ownerId: "OWN-1050", owner: "Deccan Suites Group", amount: 100000, plan: "Growth", method: "Card •••• 3310", date: "14 Aug 2026", status: "Failed" },
  { id: "PAY-88416", ownerId: "OWN-1049", owner: "Ganges View Hospitality", amount: 450000, plan: "Standard", method: "Bank transfer", date: "12 Aug 2026", status: "Successful" },
  { id: "PAY-88415", ownerId: "OWN-1046", owner: "Aravalli Grand Hotels", amount: 1000000, plan: "Growth", method: "Bank transfer", date: "09 Aug 2026", status: "Successful" },
  { id: "PAY-88414", ownerId: "OWN-1043", owner: "Sahyadri Resorts LLP", amount: 45000, plan: "Standard", method: "Card •••• 7781", date: "08 Aug 2026", status: "Refunded" },
];

export const invoices = [
  { id: "INV-2026-0412", ownerId: "OWN-1044", owner: "Marine Bay Hotels", period: "Feb 2026 – Feb 2027", amount: 1850000, tax: 333000, total: 2183000, status: "Paid", due: "18 Aug 2026" },
  { id: "INV-2026-0411", ownerId: "OWN-1042", owner: "ABC Hospitality Pvt Ltd", period: "Oct 2025 – Sep 2026", amount: 1000000, tax: 180000, total: 1180000, status: "Paid", due: "17 Aug 2026" },
  { id: "INV-2026-0410", ownerId: "OWN-1048", owner: "Coastline Retreats", period: "Aug 2026", amount: 45000, tax: 8100, total: 53100, status: "Overdue", due: "19 Jul 2026" },
  { id: "INV-2026-0409", ownerId: "OWN-1045", owner: "Backwater Collection", period: "Aug 2026", amount: 45000, tax: 8100, total: 53100, status: "Pending", due: "29 Aug 2026" },
  { id: "INV-2026-0408", ownerId: "OWN-1051", owner: "Temple Town Hotels", period: "Aug 2026", amount: 45000, tax: 8100, total: 53100, status: "Pending", due: "02 Sep 2026" },
  { id: "INV-2026-0407", ownerId: "OWN-1046", owner: "Aravalli Grand Hotels", period: "Dec 2025 – Dec 2026", amount: 1000000, tax: 180000, total: 1180000, status: "Paid", due: "09 Aug 2026" },
];

export const tickets = [
  { id: "TCK-5192", ownerId: "OWN-1042", owner: "ABC Hospitality Pvt Ltd", hotel: "Kochi Grand Hotel", subject: "Channex rates not syncing for deluxe rooms", category: "Integration", priority: "Critical", assigned: "Nishant K.", status: "In Progress", created: "28 Aug 2026 09:12", updated: "12 min ago" },
  { id: "TCK-5191", ownerId: "OWN-1046", owner: "Aravalli Grand Hotels", hotel: "Aravalli Palace Jaipur", subject: "Invoice GST number needs correction", category: "Billing", priority: "Normal", assigned: "Farah S.", status: "Waiting for Owner", created: "27 Aug 2026 17:44", updated: "3 hours ago" },
  { id: "TCK-5190", ownerId: "OWN-1044", owner: "Marine Bay Hotels", hotel: "Marine Bay Downtown", subject: "Bulk key-card re-provisioning after lock firmware update", category: "Operations", priority: "High", assigned: "Devang P.", status: "Open", created: "27 Aug 2026 11:02", updated: "5 hours ago" },
  { id: "TCK-5189", ownerId: "OWN-1043", owner: "Sahyadri Resorts LLP", hotel: "Sahyadri Valley Resort", subject: "Housekeeping app offline mode not syncing", category: "Product", priority: "High", assigned: "Nishant K.", status: "In Progress", created: "26 Aug 2026 08:30", updated: "yesterday" },
  { id: "TCK-5188", ownerId: "OWN-1051", owner: "Temple Town Hotels", hotel: "—", subject: "Request to add second property to plan", category: "Subscription", priority: "Normal", assigned: "Unassigned", status: "Open", created: "25 Aug 2026 14:20", updated: "2 days ago" },
  { id: "TCK-5187", ownerId: "OWN-1049", owner: "Ganges View Hospitality", hotel: "—", subject: "Staff role permissions clarification", category: "Account", priority: "Low", assigned: "Farah S.", status: "Resolved", created: "22 Aug 2026 10:05", updated: "4 days ago" },
  { id: "TCK-5186", ownerId: "OWN-1048", owner: "Coastline Retreats", hotel: "Coastline Palm Grove", subject: "Card payment declined repeatedly", category: "Billing", priority: "Critical", assigned: "Devang P.", status: "Closed", created: "19 Jul 2026 16:41", updated: "1 month ago" },
];

export const integrations = [
  { name: "Channex — Channel Manager", scope: "Platform-wide", status: "Warning", lastSync: "4 min ago", errors: 12, detail: "Rate push failing for 2 properties" },
  { name: "Razorpay — Payments", scope: "Platform-wide", status: "Healthy", lastSync: "1 min ago", errors: 0, detail: "All webhooks acknowledged" },
  { name: "Stripe — International payments", scope: "UAE region", status: "Healthy", lastSync: "2 min ago", errors: 0, detail: "Operating normally" },
  { name: "Booking Engine CDN", scope: "Platform-wide", status: "Healthy", lastSync: "just now", errors: 0, detail: "Edge cache 99.99%" },
  { name: "WhatsApp Business API", scope: "Notifications", status: "Error", lastSync: "51 min ago", errors: 34, detail: "Template approval revoked by provider" },
  { name: "Key-card Vendor (Onity)", scope: "2 properties", status: "Disconnected", lastSync: "6 hours ago", errors: 3, detail: "Gateway unreachable at Marine Bay Creekside" },
  { name: "S3 Media Storage", scope: "Platform-wide", status: "Healthy", lastSync: "just now", errors: 0, detail: "8.7 TB used" },
];

export const systemComponents = [
  { name: "API Gateway", status: "Healthy", metric: "142 ms p95", sub: "0.02% error rate" },
  { name: "PostgreSQL Primary", status: "Healthy", metric: "8 ms p95", sub: "connections 214 / 500" },
  { name: "Redis Cache", status: "Healthy", metric: "1.2 ms", sub: "hit rate 98.4%" },
  { name: "Job Queues", status: "Degraded", metric: "2,140 backlog", sub: "notifications queue lagging" },
  { name: "WebSockets", status: "Healthy", metric: "9,684 sessions", sub: "0 drops (1h)" },
  { name: "Object Storage", status: "Healthy", metric: "8.7 TB", sub: "of 20 TB" },
  { name: "Notification Service", status: "Degraded", metric: "3.1% failures", sub: "WhatsApp provider issue" },
  { name: "Channel Manager", status: "Degraded", metric: "12 sync errors", sub: "2 properties affected" },
  { name: "Payments", status: "Healthy", metric: "99.7% success", sub: "3 failures today" },
];

export const jobs = [
  { name: "Channel sync — inventory push", queue: "channex", state: "Processing", count: 412, runtime: "avg 2.1s", attempts: 1 },
  { name: "Subscription expiry checks", queue: "billing", state: "Completed", count: 184, runtime: "avg 0.4s", attempts: 1 },
  { name: "Invoice generation", queue: "billing", state: "Pending", count: 26, runtime: "queued", attempts: 0 },
  { name: "Notification dispatch — WhatsApp", queue: "notifications", state: "Failed", count: 8, runtime: "avg 5.9s", attempts: 3 },
  { name: "Nightly analytics rollup", queue: "reports", state: "Completed", count: 1, runtime: "6m 12s", attempts: 1 },
  { name: "Offline sync reconciliation", queue: "pms", state: "Retried", count: 14, runtime: "avg 3.3s", attempts: 2 },
];

export const activityFeed = [
  { time: "12 min ago", actor: "Rajesh Menon", owner: "ABC Hospitality Pvt Ltd", text: "Connected Channex for Kochi Grand Hotel", tone: "info" },
  { time: "48 min ago", actor: "System", owner: "Marine Bay Hotels", text: "Annual subscription renewed — ₹18,50,000 collected", tone: "success" },
  { time: "2 hours ago", actor: "Anita Deshpande", owner: "Sahyadri Resorts LLP", text: "Created GM account for Sahyadri Valley Resort", tone: "neutral" },
  { time: "5 hours ago", actor: "System", owner: "Coastline Retreats", text: "Payment failed — card declined (₹45,000)", tone: "danger" },
  { time: "yesterday", actor: "Vikram Singh", owner: "Aravalli Grand Hotels", text: "Added property Aravalli Palace Jaipur — 168 rooms", tone: "info" },
  { time: "yesterday", actor: "Priya Nair", owner: "Backwater Collection", text: "Subscription entered grace period", tone: "warning" },
  { time: "2 days ago", actor: "Meera Krishnan", owner: "Nilgiri Stay Co.", text: "Started 14-day trial on Starter plan", tone: "info" },
];

export const auditLogs = [
  { ts: "28 Aug 2026 14:02:11", actor: "John Mathew", role: "Super Admin", owner: "ABC Hospitality Pvt Ltd", hotel: "—", action: "Subscription extended", entity: "SUB-9100", ip: "103.21.44.19", device: "Chrome / macOS", before: "Expiry 30 Sep 2026", after: "Expiry 30 Dec 2026", reason: "Goodwill after integration outage" },
  { ts: "28 Aug 2026 12:47:03", actor: "Farah Sheikh", role: "Support Admin", owner: "Coastline Retreats", hotel: "Coastline Palm Grove", action: "Property suspended", entity: "PRP-3340", ip: "49.37.120.7", device: "Chrome / Windows", before: "Status Active", after: "Status Suspended", reason: "Non-payment > 30 days" },
  { ts: "28 Aug 2026 11:15:52", actor: "Devang Patel", role: "Finance Admin", owner: "Sahyadri Resorts LLP", hotel: "—", action: "Refund created", entity: "PAY-88414", ip: "182.70.9.44", device: "Firefox / Windows", before: "Paid ₹45,000", after: "Refunded ₹45,000", reason: "Duplicate charge" },
  { ts: "28 Aug 2026 09:32:20", actor: "Nishant Kumar", role: "Technical Admin", owner: "Marine Bay Hotels", hotel: "Marine Bay Creekside", action: "Key deactivated", entity: "KEY-7741", ip: "27.58.11.90", device: "Chrome / Linux", before: "Active", after: "Deactivated", reason: "Lock firmware rollback" },
  { ts: "27 Aug 2026 18:04:41", actor: "John Mathew", role: "Super Admin", owner: "Temple Town Hotels", hotel: "—", action: "Property limit changed", entity: "SUB-9109", ip: "103.21.44.19", device: "Chrome / macOS", before: "2 properties", after: "5 properties", reason: "Upgrade requested via TCK-5188" },
  { ts: "27 Aug 2026 15:22:09", actor: "Farah Sheikh", role: "Support Admin", owner: "Aravalli Grand Hotels", hotel: "Aravalli Palace Jaipur", action: "Reservation cancelled", entity: "RES-10294", ip: "49.37.120.7", device: "Chrome / Windows", before: "Confirmed", after: "Cancelled", reason: "Owner request during impersonation" },
];

export const adminUsers = [
  { name: "John Mathew", email: "john@travelo.io", role: "Super Admin", status: "Active", mfa: "Enabled", lastLogin: "28 Aug 2026 14:41" },
  { name: "Farah Sheikh", email: "farah@travelo.io", role: "Support Admin", status: "Active", mfa: "Enabled", lastLogin: "28 Aug 2026 13:02" },
  { name: "Devang Patel", email: "devang@travelo.io", role: "Finance Admin", status: "Active", mfa: "Enabled", lastLogin: "28 Aug 2026 11:10" },
  { name: "Nishant Kumar", email: "nishant@travelo.io", role: "Technical Admin", status: "Active", mfa: "Enabled", lastLogin: "28 Aug 2026 09:28" },
  { name: "Ritu Balan", email: "ritu@travelo.io", role: "Operations Admin", status: "Inactive", mfa: "Disabled", lastLogin: "12 Aug 2026 16:55" },
  { name: "Aloysius Fernando", email: "aloysius@travelo.io", role: "Auditor", status: "Blocked", mfa: "Enabled", lastLogin: "02 Jul 2026 10:31" },
];

export const roles = [
  "Super Admin", "Platform Admin", "Finance Admin", "Support Admin",
  "Operations Admin", "Technical Admin", "Auditor",
];

export const permissionMatrix = [
  { group: "Owners", actions: ["View", "Create", "Edit", "Suspend"] },
  { group: "Subscriptions", actions: ["View", "Create", "Edit", "Extend", "Cancel"] },
  { group: "Billing", actions: ["View", "Refund", "Export"] },
  { group: "Support", actions: ["View", "Reply", "Assign", "Resolve"] },
  { group: "Audit", actions: ["View", "Export"] },
  { group: "Platform", actions: ["View", "Configure", "Impersonate"] },
];

export const impersonationSessions = [
  { admin: "Farah Sheikh", target: "Rajesh Menon (Owner)", owner: "ABC Hospitality Pvt Ltd", start: "28 Aug 2026 10:12", end: "28 Aug 2026 10:34", duration: "22m", actions: 14 },
  { admin: "Devang Patel", target: "Sandeep Varma (GM)", owner: "ABC Hospitality Pvt Ltd", start: "27 Aug 2026 16:02", end: "27 Aug 2026 16:20", duration: "18m", actions: 6 },
  { admin: "Nishant Kumar", target: "Omar Haddad (GM)", owner: "Marine Bay Hotels", start: "26 Aug 2026 12:44", end: "26 Aug 2026 13:29", duration: "45m", actions: 31 },
  { admin: "Farah Sheikh", target: "Anita Deshpande (Owner)", owner: "Sahyadri Resorts LLP", start: "24 Aug 2026 09:03", end: "24 Aug 2026 09:11", duration: "8m", actions: 3 },
];

export const staff = [
  { name: "Sandeep Varma", owner: "ABC Hospitality Pvt Ltd", hotel: "Kochi Grand Hotel", department: "Management", role: "General Manager", status: "Active", lastLogin: "20 min ago", created: "18 Mar 2024" },
  { name: "Reena Thomas", owner: "ABC Hospitality Pvt Ltd", hotel: "Kochi Grand Hotel", department: "Management", role: "AGM", status: "Active", lastLogin: "1 hour ago", created: "22 Mar 2024" },
  { name: "Asha Pillai", owner: "ABC Hospitality Pvt Ltd", hotel: "Marari Beach Resort", department: "Front Office", role: "Receptionist", status: "Active", lastLogin: "3 hours ago", created: "04 Apr 2024" },
  { name: "Omar Haddad", owner: "Marine Bay Hotels", hotel: "Marine Bay Downtown", department: "Management", role: "General Manager", status: "Active", lastLogin: "45 min ago", created: "12 Dec 2023" },
  { name: "Layla Aziz", owner: "Marine Bay Hotels", hotel: "Marine Bay Downtown", department: "Housekeeping", role: "Housekeeping Head", status: "Active", lastLogin: "2 hours ago", created: "12 Dec 2023" },
  { name: "Kiran Patil", owner: "Sahyadri Resorts LLP", hotel: "Sahyadri Valley Resort", department: "Management", role: "General Manager", status: "Active", lastLogin: "yesterday", created: "09 Jul 2024" },
  { name: "Ryan Dsouza", owner: "Coastline Retreats", hotel: "Coastline Palm Grove", department: "Management", role: "General Manager", status: "Inactive", lastLogin: "22 days ago", created: "18 Feb 2024" },
  { name: "Mahendra Rathore", owner: "Aravalli Grand Hotels", hotel: "Aravalli Palace Jaipur", department: "Management", role: "General Manager", status: "Active", lastLogin: "5 hours ago", created: "02 Jun 2024" },
];

export const notificationTemplates = [
  { name: "Subscription expiring", channel: "Email · In-app", updated: "12 Aug 2026", status: "Active", body: "Hi {{owner_name}}, your Travelo subscription for {{hotel_name}} expires on {{expiry_date}}." },
  { name: "Subscription expired", channel: "Email · SMS", updated: "12 Aug 2026", status: "Active", body: "{{owner_name}}, your subscription expired on {{expiry_date}}. Access is now limited." },
  { name: "Payment successful", channel: "Email", updated: "02 Aug 2026", status: "Active", body: "We received {{amount}} for {{owner_name}}. Invoice attached." },
  { name: "Payment failed", channel: "Email · WhatsApp", updated: "02 Aug 2026", status: "Active", body: "Payment of {{amount}} failed for {{owner_name}}. Please update your payment method." },
  { name: "Account created", channel: "Email", updated: "28 Jul 2026", status: "Active", body: "Welcome to Travelo, {{owner_name}}. Your workspace is ready." },
  { name: "Support ticket update", channel: "Email · In-app", updated: "19 Jul 2026", status: "Active", body: "Ticket update for {{hotel_name}}." },
  { name: "System outage", channel: "In-app · Email", updated: "04 Jul 2026", status: "Draft", body: "We are investigating a service disruption affecting {{hotel_name}}." },
  { name: "Channel sync failure", channel: "In-app", updated: "04 Jul 2026", status: "Active", body: "Channel sync failed for {{hotel_name}}. Our team is on it." },
];

export const announcements = [
  { title: "Scheduled maintenance — 02 Sep, 01:00–03:00 IST", audience: "All owners", channels: "In-app, Email", priority: "High", status: "Scheduled", sent: "02 Sep 2026 01:00" },
  { title: "New: Kitchen module now included in Growth", audience: "Growth plan owners", channels: "In-app", priority: "Normal", status: "Published", sent: "21 Aug 2026" },
  { title: "GST invoice format update", audience: "India owners", channels: "Email", priority: "Normal", status: "Published", sent: "09 Aug 2026" },
  { title: "Channex webhook migration", audience: "Selected hotels (18)", channels: "In-app, Email", priority: "Critical", status: "Draft", sent: "—" },
];

export const notifications = [
  { id: 1, tone: "danger", category: "Failed payments", title: "3 payments failed today", time: "18 min ago", to: "/payments" },
  { id: 2, tone: "danger", category: "Channel failures", title: "Onity key-card gateway disconnected", time: "1 hour ago", to: "/integrations" },
  { id: 3, tone: "warning", category: "Subscription expiry", title: "14 subscriptions expire within 7 days", time: "3 hours ago", to: "/subscriptions" },
  { id: 4, tone: "warning", category: "System errors", title: "Notification queue backlog at 2,140", time: "4 hours ago", to: "/system-health" },
  { id: 5, tone: "info", category: "Support tickets", title: "TCK-5192 escalated to Critical", time: "5 hours ago", to: "/support" },
  { id: 6, tone: "success", category: "Critical incidents", title: "Booking engine incident resolved", time: "yesterday", to: "/system-health" },
] as const;

export const revenueByPlan = [
  { plan: "Enterprise", mrr: 2960000, customers: 16 },
  { plan: "Growth", mrr: 4600000, customers: 46 },
  { plan: "Standard", mrr: 3195000, customers: 71 },
  { plan: "Starter", mrr: 684000, customers: 38 },
];

export const saasMetrics = [
  { label: "MRR", value: "₹42.6L", delta: "+6.4%" },
  { label: "ARR", value: "₹5.11Cr", delta: "+18.2%" },
  { label: "ARPU", value: "₹24,912", delta: "+2.1%" },
  { label: "New MRR", value: "₹3.9L", delta: "+11%" },
  { label: "Expansion MRR", value: "₹1.4L", delta: "+8%" },
  { label: "Churned MRR", value: "₹0.7L", delta: "-3%" },
  { label: "Net Revenue Retention", value: "112%", delta: "+4 pts" },
  { label: "Customers", value: "184", delta: "+12" },
];

export const listingChecklist = [
  { label: "Basic information", weight: 15 },
  { label: "Photos", weight: 20 },
  { label: "Room types", weight: 20 },
  { label: "Amenities", weight: 15 },
  { label: "Policies", weight: 10 },
  { label: "Contact", weight: 10 },
  { label: "Location", weight: 10 },
];

export const usageByOwner = owners.slice(0, 8).map((o) => ({
  owner: o.company,
  properties: o.properties,
  reservations: 2400 + o.rooms * 11,
  apiRequests: `${(o.rooms * 1.7).toFixed(1)}K`,
  syncs: o.properties * 412,
  storage: `${(o.rooms * 0.9).toFixed(0)} GB`,
  activeUsers: o.staff,
}));
