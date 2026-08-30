import {
  Activity,
  Bell,
  Building2,
  CreditCard,
  Gauge,
  HeartPulse,
  KeyRound,
  Layers,
  LayoutDashboard,
  LifeBuoy,
  ListChecks,
  Megaphone,
  PlugZap,
  Receipt,
  Repeat,
  ScrollText,
  Settings,
  ShieldCheck,
  TrendingUp,
  UserCog,
  UserSearch,
  Users,
  Wallet,
} from "lucide-react";

export type NavItem = {
  label: string;
  to: string;
  icon: typeof Users;
  /** Permission the current admin must hold to see this item. Omit = always shown. */
  permission?: string;
};
export type NavSection = { title: string; items: NavItem[] };

export const navSections: NavSection[] = [
  {
    title: "Overview",
    items: [{ label: "Dashboard", to: "/", icon: LayoutDashboard }],
  },
  {
    title: "Customers",
    items: [
      { label: "Owners", to: "/owners", icon: Users, permission: "owner.view" },
      { label: "Properties", to: "/properties", icon: Building2, permission: "property.view" },
      { label: "Staff", to: "/staff", icon: UserCog, permission: "staff.read" },
      { label: "Owner Activity", to: "/activity", icon: Activity, permission: "analytics.view" },
    ],
  },
  {
    title: "Monetization",
    items: [
      { label: "Subscription Plans", to: "/plans", icon: Layers, permission: "plan.view" },
      { label: "Subscriptions", to: "/subscriptions", icon: Repeat, permission: "subscription.view" },
      { label: "Payments", to: "/payments", icon: CreditCard, permission: "billing.view" },
      { label: "Invoices", to: "/invoices", icon: Receipt, permission: "invoice.view" },
      { label: "Revenue", to: "/revenue", icon: TrendingUp, permission: "analytics.view" },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Property Listings", to: "/listings", icon: ListChecks, permission: "property.view" },
      { label: "Platform Usage", to: "/usage", icon: Gauge, permission: "analytics.view" },
      { label: "Integrations", to: "/integrations", icon: PlugZap, permission: "integration.view" },
      { label: "System Health", to: "/system-health", icon: HeartPulse },
      { label: "Background Jobs", to: "/jobs", icon: Wallet },
    ],
  },
  {
    title: "Support",
    items: [
      { label: "Support Tickets", to: "/support", icon: LifeBuoy, permission: "support.view" },
      { label: "Announcements", to: "/announcements", icon: Megaphone, permission: "announcement.view" },
      { label: "Notifications", to: "/notifications", icon: Bell, permission: "notification.view" },
    ],
  },
  {
    title: "Security",
    items: [
      { label: "Audit Logs", to: "/audit", icon: ScrollText, permission: "audit.view" },
      { label: "Admin Users", to: "/admin-users", icon: ShieldCheck, permission: "admin.view" },
      { label: "Roles & Permissions", to: "/roles", icon: KeyRound, permission: "admin.view" },
      { label: "Impersonation", to: "/impersonation", icon: UserSearch, permission: "impersonation.view" },
    ],
  },
  {
    title: "Configuration",
    items: [{ label: "Platform Settings", to: "/settings", icon: Settings }],
  },
];
