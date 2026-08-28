import { createFileRoute, Link } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { DataTable, type Column } from "@/components/admin/data-table";
import { ExtendSubscriptionDialog, PropertyLimitDialog } from "@/components/admin/extend-subscription";
import { KpiCard, MetricRow, PageHeader, StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { inr, owners, subscriptions } from "@/lib/travelo-data";

export const Route = createFileRoute("/subscriptions")({
  head: () => ({
    meta: [
      { title: "Subscriptions · Travelo Super Admin" },
      { name: "description", content: "Track, extend and adjust every hotel subscription: cycles, expiry, grace periods and renewals." },
      { property: "og:title", content: "Subscriptions · Travelo Super Admin" },
      { property: "og:description", content: "Subscription lifecycle management for the Travelo platform." },
    ],
  }),
  component: SubscriptionsPage,
});

type Sub = (typeof subscriptions)[number];

function SubscriptionsPage() {
  const [filter, setFilter] = useState("all");
  const [drawer, setDrawer] = useState<Sub | null>(null);

  const rows = subscriptions.filter((s) => {
    if (filter === "all") return true;
    if (filter === "expiring7") return s.status === "Expiring";
    if (filter === "expiring30") return ["Expiring", "Grace Period"].includes(s.status);
    return s.status === filter;
  });

  const columns: Column<Sub>[] = [
    {
      key: "owner", header: "Owner", sortValue: (s) => s.owner,
      cell: (s) => (
        <Link to="/owners/$ownerId" params={{ ownerId: s.ownerId }} onClick={(e) => e.stopPropagation()} className="font-semibold hover:text-primary hover:underline">
          {s.owner}
        </Link>
      ),
    },
    { key: "plan", header: "Plan", sortValue: (s) => s.plan, cell: (s) => s.plan },
    { key: "props", header: "Properties", align: "right", sortValue: (s) => s.properties, cell: (s) => <span className="tnum">{s.properties}</span> },
    { key: "mrr", header: "Monthly value", align: "right", sortValue: (s) => s.mrr, cell: (s) => <span className="tnum">{inr(s.mrr)}</span> },
    { key: "cycle", header: "Cycle", cell: (s) => <span className="text-muted-foreground">{s.cycle}</span> },
    { key: "start", header: "Start", optional: true, cell: (s) => <span className="tnum text-muted-foreground">{s.start}</span> },
    { key: "expiry", header: "Expiry", sortValue: (s) => s.expiry, cell: (s) => <span className="tnum">{s.expiry}</span> },
    { key: "status", header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
    { key: "auto", header: "Auto renewal", cell: (s) => <StatusBadge status={s.autoRenew ? "Active" : "Inactive"} /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Monetization"
        title="Subscriptions"
        description="Lifecycle of every paying account — extend, adjust limits or cancel with a full audit trail."
        breadcrumbs={[{ label: "Super Admin", to: "/" }, { label: "Subscriptions" }]}
      />
      <div className="space-y-4 p-4 lg:p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Active subscriptions" value="171" delta="+7" hint="incl. 12 trials" />
          <KpiCard label="Expiring < 7 days" value="14" trend="down" delta="needs outreach" />
          <KpiCard label="In grace period" value="6" trend="down" delta="₹2.7L at risk" />
          <KpiCard label="Expired / suspended" value="12" trend="down" delta="recovery queue" />
        </div>

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(s) => s.id}
          searchKeys={(s) => `${s.owner} ${s.plan} ${s.id}`}
          searchPlaceholder="Search owner or subscription ID…"
          exportName="Subscriptions"
          onRowClick={(s) => setDrawer(s)}
          filters={
            <Select value={filter} onValueChange={setFilter}>
              <SelectTrigger className="h-8 w-[190px] text-sm" aria-label="Filter subscriptions">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All subscriptions</SelectItem>
                <SelectItem value="expiring7">Expiring &lt; 7 days</SelectItem>
                <SelectItem value="expiring30">Expiring &lt; 30 days</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Trial">Trial</SelectItem>
                <SelectItem value="Grace Period">Grace period</SelectItem>
                <SelectItem value="Expired">Expired</SelectItem>
                <SelectItem value="Suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          }
          rowActions={(s) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7" aria-label={`Actions for ${s.owner}`}>
                  <MoreHorizontal aria-hidden className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setDrawer(s)}>Quick view</DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/owners/$ownerId" params={{ ownerId: s.ownerId }}>Owner 360</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/invoices">Billing</Link></DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.success(`Renewal reminder sent to ${s.owner}`)}>
                  Send renewal reminder
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          emptyTitle="No subscriptions match"
          emptyDescription="Try a different filter, or onboard an owner to create the first subscription."
        />
      </div>

      <Sheet open={!!drawer} onOpenChange={(o) => !o && setDrawer(null)}>
        <SheetContent className="w-full sm:max-w-md">
          {drawer && (
            <>
              <SheetHeader>
                <SheetTitle>{drawer.owner}</SheetTitle>
                <SheetDescription>{drawer.id} · {drawer.plan} · {drawer.cycle}</SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <StatusBadge status={drawer.status} />
                <dl>
                  <MetricRow label="Properties" value={drawer.properties} />
                  <MetricRow label="Monthly value" value={inr(drawer.mrr)} />
                  <MetricRow label="Annual value" value={inr(drawer.mrr * 12)} />
                  <MetricRow label="Started" value={drawer.start} />
                  <MetricRow label="Expires" value={drawer.expiry} />
                  <MetricRow label="Auto renewal" value={drawer.autoRenew ? "On" : "Off"} />
                </dl>
                <div className="flex flex-wrap gap-2">
                  <ExtendSubscriptionDialog owner={{ company: drawer.owner, plan: drawer.plan, expiry: drawer.expiry }} />
                  <PropertyLimitDialog owner={{ company: drawer.owner, properties: drawer.properties }} />
                  <Button asChild variant="outline" size="sm" className="h-8">
                    <Link to="/owners/$ownerId" params={{ ownerId: drawer.ownerId }}>Open owner 360</Link>
                  </Button>
                  <ConfirmDialog
                    trigger={<Button variant="outline" size="sm" className="h-8 text-destructive">Cancel subscription</Button>}
                    title={`Cancel ${drawer.owner}'s subscription?`}
                    description="Access continues until expiry, then all modules are locked."
                    impact={["Auto renewal disabled", `${drawer.properties} properties lose access at expiry`]}
                    confirmLabel="Cancel subscription"
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Owner base: {owners.length} accounts · changes here are audited automatically.
                </p>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
