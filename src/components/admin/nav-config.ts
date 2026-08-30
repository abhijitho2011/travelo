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

export type NavItem = { label: string; to: string; icon: typeof Users };
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
      { label: "Subscriptions", to: "/subscriptions", icon: Repeat },
      { label: "Payments", to: "/payments", icon: CreditCard },
      { label: "Invoices", to: "/invoices", icon: Receipt },
      { label: "Revenue", to: "/revenue", icon: TrendingUp },
    ],
  },
  {
    title: "Operations",
    items: [
      { label: "Property Listings", to: "/listings", icon: ListChecks },
      { label: "Platform Usage", to: "/usage", icon: Gauge },
      { label: "Integrations", to: "/integrations", icon: PlugZap },
      { label: "System Health", to: "/system-health", icon: HeartPulse },
      { label: "Background Jobs", to: "/jobs", icon: Wallet },
    ],
  },
  {
    title: "Support",
    items: [
      { label: "Support Tickets", to: "/support", icon: LifeBuoy },
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
    title: "Configuration",
    items: [{ label: "Platform Settings", to: "/settings", icon: Settings }],
  },
];
