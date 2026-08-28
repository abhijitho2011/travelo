import {
  LayoutDashboard, Users, Building2, UserCog, Activity, Layers, CreditCard,
  Receipt, Percent, TrendingUp, ListChecks, Gauge, PlugZap, HeartPulse,
  LifeBuoy, Megaphone, Bell, ScrollText, ShieldCheck, KeyRound, UserSearch,
  BarChart3, ToggleLeft, Settings, MailOpen, Repeat, Wallet,
} from "lucide-react";

export type NavItem = { label: string; to: string; icon: typeof Users; badge?: string };
export type NavSection = { title: string; items: NavItem[] };

export const navSections: NavSection[] = [
  {
    title: "Overview",
    items: [{ label: "Dashboard", to: "/", icon: LayoutDashboard }],
  },
  {
    title: "Customers",
    items: [
      { label: "Owners", to: "/owners", icon: Users },
      { label: "Properties", to: "/properties", icon: Building2 },
      { label: "Staff", to: "/staff", icon: UserCog },
      { label: "Owner Activity", to: "/activity", icon: Activity },
    ],
  },
  {
    title: "Monetization",
    items: [
      { label: "Subscription Plans", to: "/plans", icon: Layers },
      { label: "Subscriptions", to: "/subscriptions", icon: Repeat, badge: "14" },
      { label: "Payments", to: "/payments", icon: CreditCard, badge: "3" },
      { label: "Invoices", to: "/invoices", icon: Receipt },
      { label: "Discounts", to: "/discounts", icon: Percent },
      { label: "Revenue", to: "/revenue", icon: TrendingUp },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Property Listings", to: "/listings", icon: ListChecks },
      { label: "Platform Usage", to: "/usage", icon: Gauge },
      { label: "Integrations", to: "/integrations", icon: PlugZap, badge: "2" },
      { label: "System Health", to: "/system-health", icon: HeartPulse },
      { label: "Background Jobs", to: "/jobs", icon: Wallet },
    ],
  },
  {
    title: "Support",
    items: [
      { label: "Support Tickets", to: "/support", icon: LifeBuoy, badge: "5" },
      { label: "Announcements", to: "/announcements", icon: Megaphone },
      { label: "Notifications", to: "/notifications", icon: Bell },
    ],
  },
  {
    title: "Security",
    items: [
      { label: "Audit Logs", to: "/audit", icon: ScrollText },
      { label: "Admin Users", to: "/admin-users", icon: ShieldCheck },
      { label: "Roles & Permissions", to: "/roles", icon: KeyRound },
      { label: "Impersonation", to: "/impersonation", icon: UserSearch },
    ],
  },
  {
    title: "Analytics",
    items: [{ label: "Platform Analytics", to: "/analytics", icon: BarChart3 }],
  },
  {
    title: "Configuration",
    items: [
      { label: "Feature Entitlements", to: "/entitlements", icon: ToggleLeft },
      { label: "Notification Templates", to: "/templates", icon: MailOpen },
      { label: "Platform Settings", to: "/settings", icon: Settings },
    ],
  },
];
