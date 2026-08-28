import { createFileRoute, Link } from "@tanstack/react-router";
import { CheckCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { KpiCard, PageHeader, Section, StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { notifications } from "@/lib/travelo-data";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notification Center · Travelo Super Admin" },
      { name: "description", content: "Platform alerts for failed payments, expiring subscriptions, integration failures and critical incidents." },
      { property: "og:title", content: "Notification Center · Travelo Super Admin" },
      { property: "og:description", content: "Operational alert inbox for Travelo administrators." },
    ],
  }),
  component: NotificationsPage,
});

const categories = ["All", "Failed payments", "Subscription expiry", "Channel failures", "System errors", "Support tickets", "Critical incidents"];

function NotificationsPage() {
  const [category, setCategory] = useState("All");
  const [read, setRead] = useState<number[]>([]);
  const rows = notifications.filter((n) => category === "All" || n.category === category);

  return (
    <>
      <PageHeader
        eyebrow="Support"
        title="Notification Center"
        description="Everything that needs an administrator's attention, grouped by category."
        breadcrumbs={[{ label: "Super Admin", to: "/" }, { label: "Notifications" }]}
        actions={
          <Button variant="outline" size="sm" className="h-8" onClick={() => { setRead(notifications.map((n) => n.id)); toast.success("All notifications marked read"); }}>
            <CheckCheck aria-hidden className="mr-1.5 size-3.5" /> Mark all read
          </Button>
        }
      />
      <div className="space-y-4 p-4 lg:p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Unread alerts" value={String(notifications.length - read.length)} trend="down" delta="2 critical" />
          <KpiCard label="Critical (24h)" value="2" trend="down" delta="payments, hardware" />
          <KpiCard label="Warnings" value="2" hint="expiry, backlog" />
          <KpiCard label="Resolved (7d)" value="38" delta="+9" />
        </div>

        <div className="flex flex-wrap gap-1.5" role="tablist" aria-label="Notification categories">
          {categories.map((c) => (
            <button
              key={c}
              role="tab"
              aria-selected={category === c}
              onClick={() => setCategory(c)}
              className={cn(
                "rounded-md border px-2.5 py-1 text-xs font-medium transition-colors",
                category === c
                  ? "border-primary bg-primary text-primary-foreground"
                  : "border-border bg-surface text-muted-foreground hover:text-foreground",
              )}
            >
              {c}
            </button>
          ))}
        </div>

        <Section title={category === "All" ? "All notifications" : category}>
          <ul className="divide-y divide-border">
            {rows.map((n) => (
              <li key={n.id} className={cn("flex flex-wrap items-center justify-between gap-3 px-4 py-3", read.includes(n.id) && "opacity-60")}>
                <span className="min-w-0">
                  <span className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={n.tone === "danger" ? "Critical" : n.tone === "warning" ? "Warning" : n.tone === "success" ? "Resolved" : "Info"} />
                    <span className="text-sm font-semibold text-foreground">{n.title}</span>
                  </span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">{n.category} · {n.time}</span>
                </span>
                <span className="flex gap-1.5">
                  <Button asChild variant="outline" size="sm" className="h-7 text-xs">
                    <Link to={n.to}>Investigate</Link>
                  </Button>
                  <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => setRead((r) => [...r, n.id])}>
                    Mark read
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        </Section>
      </div>
    </>
  );
}
