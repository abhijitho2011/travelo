import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Building2, MoreHorizontal, Plus, UserSearch } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { DataTable, type Column } from "@/components/admin/data-table";
import { MetricRow, PageHeader, StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle,
} from "@/components/ui/sheet";
import { inr, owners, type Owner } from "@/lib/travelo-data";

export const Route = createFileRoute("/owners/")({
  head: () => ({
    meta: [
      { title: "Owners · Travelo Super Admin" },
      { name: "description", content: "Owner CRM: accounts, properties, plans, subscription status and revenue." },
      { property: "og:title", content: "Owners · Travelo Super Admin" },
      { property: "og:description", content: "Owner CRM for the Travelo platform." },
    ],
  }),
  component: OwnersPage,
});

function OwnersPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("all");
  const [plan, setPlan] = useState("all");
  const [drawer, setDrawer] = useState<Owner | null>(null);

  const rows = owners.filter(
    (o) =>
      (status === "all" || o.status === status) && (plan === "all" || o.plan === plan),
  );

  const columns: Column<Owner>[] = [
    {
      key: "owner",
      header: "Owner",
      sortValue: (o) => o.company,
      cell: (o) => (
        <div className="min-w-0">
          <Link
            to="/owners/$ownerId"
            params={{ ownerId: o.id }}
            className="block truncate font-semibold text-foreground hover:text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {o.company}
          </Link>
          <span className="block truncate text-xs text-muted-foreground">
            {o.name} · {o.email}
          </span>
        </div>
      ),
    },
    { key: "location", header: "Location", optional: true, cell: (o) => <span className="text-muted-foreground">{o.city}, {o.country}</span> },
    { key: "properties", header: "Properties", align: "right", sortValue: (o) => o.properties, cell: (o) => <span className="tnum">{o.properties}</span> },
    { key: "rooms", header: "Rooms", align: "right", sortValue: (o) => o.rooms, cell: (o) => <span className="tnum">{o.rooms}</span> },
    { key: "plan", header: "Plan", sortValue: (o) => o.plan, cell: (o) => <span className="font-medium">{o.plan}</span> },
    { key: "mrr", header: "Monthly value", align: "right", sortValue: (o) => o.mrr, cell: (o) => <span className="tnum">{inr(o.mrr)}</span> },
    { key: "cycle", header: "Subscription", optional: true, cell: (o) => <span className="text-muted-foreground">{o.subscription}</span> },
    { key: "expiry", header: "Expiry", cell: (o) => <span className="tnum text-muted-foreground">{o.expiry}</span> },
    { key: "status", header: "Status", sortValue: (o) => o.status, cell: (o) => <StatusBadge status={o.status} /> },
    { key: "last", header: "Last active", optional: true, cell: (o) => <span className="text-muted-foreground">{o.lastActive}</span> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Customers"
        title="Owners"
        description="Every hotel group on the platform, with subscription and revenue context."
        breadcrumbs={[{ label: "Super Admin", to: "/" }, { label: "Owners" }]}
        actions={
          <>
            <Button variant="outline" size="sm" className="h-8" onClick={() => toast.info("Bulk import", { description: "CSV import supports up to 500 owners." })}>
              Import CSV
            </Button>
            <Button asChild size="sm" className="h-8">
              <Link to="/owners/new">
                <Plus aria-hidden className="mr-1.5 size-3.5" /> Add owner
              </Link>
            </Button>
          </>
        }
      />

      <div className="p-4 lg:p-6">
        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(o) => o.id}
          searchKeys={(o) => `${o.company} ${o.name} ${o.email} ${o.city} ${o.id}`}
          searchPlaceholder="Search owner, company, email…"
          exportName="Owners"
          selectable
          onRowClick={(o) => setDrawer(o)}
          filters={
            <>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-8 w-[150px] text-sm" aria-label="Filter by status">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All statuses</SelectItem>
                  <SelectItem value="Active">Active</SelectItem>
                  <SelectItem value="Trial">Trial</SelectItem>
                  <SelectItem value="Expiring">Expiring soon</SelectItem>
                  <SelectItem value="Grace Period">Grace period</SelectItem>
                  <SelectItem value="Expired">Expired</SelectItem>
                  <SelectItem value="Suspended">Suspended</SelectItem>
                </SelectContent>
              </Select>
              <Select value={plan} onValueChange={setPlan}>
                <SelectTrigger className="h-8 w-[140px] text-sm" aria-label="Filter by plan">
                  <SelectValue placeholder="Plan" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All plans</SelectItem>
                  <SelectItem value="Starter">Starter</SelectItem>
                  <SelectItem value="Standard">Standard</SelectItem>
                  <SelectItem value="Growth">Growth</SelectItem>
                  <SelectItem value="Enterprise">Enterprise</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
          bulkActions={(selected, clear) => (
            <>
              <Button variant="outline" size="sm" className="h-7" onClick={() => { toast.success(`Renewal reminder sent to ${selected.length} owners`); clear(); }}>
                Send renewal reminder
              </Button>
              <ConfirmDialog
                trigger={<Button variant="outline" size="sm" className="h-7 text-destructive">Suspend</Button>}
                title={`Suspend ${selected.length} owners?`}
                description="Suspension immediately blocks owner, GM and staff logins for every property in these accounts."
                impact={["All portals become read-only", "Booking engine goes offline", "Channel sync is paused"]}
                confirmLabel="Suspend owners"
                onConfirm={clear}
              />
            </>
          )}
          rowActions={(o) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7" aria-label={`Actions for ${o.company}`}>
                  <MoreHorizontal aria-hidden className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem onClick={() => navigate({ to: "/owners/$ownerId", params: { ownerId: o.id } })}>
                  Open owner 360
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate({ to: "/subscriptions" })}>
                  View subscription
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => navigate({ to: "/invoices" })}>Billing history</DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link to="/impersonation" search={{ owner: o.company }}>
                    <UserSearch aria-hidden className="mr-2 size-4" /> Support access
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  className="text-destructive"
                  onClick={() => toast.warning(`Use the row drawer to suspend ${o.company}`)}
                >
                  Suspend owner
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          emptyTitle="No owners match these filters"
          emptyDescription="Clear the filters, or create your first owner to start onboarding hotels."
          emptyAction={
            <Button asChild size="sm">
              <Link to="/owners/new">
                <Plus aria-hidden className="mr-1.5 size-3.5" /> Add owner
              </Link>
            </Button>
          }
        />
      </div>

      <Sheet open={!!drawer} onOpenChange={(o) => !o && setDrawer(null)}>
        <SheetContent className="w-full sm:max-w-md">
          {drawer && (
            <>
              <SheetHeader>
                <SheetTitle>{drawer.company}</SheetTitle>
                <SheetDescription>
                  {drawer.name} · {drawer.id}
                </SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <StatusBadge status={drawer.status} />
                <dl>
                  <MetricRow label="Email" value={drawer.email} />
                  <MetricRow label="Phone" value={drawer.phone} />
                  <MetricRow label="Location" value={`${drawer.city}, ${drawer.country}`} />
                  <MetricRow label="Properties" value={drawer.properties} />
                  <MetricRow label="Rooms" value={drawer.rooms} />
                  <MetricRow label="Staff" value={drawer.staff} />
                  <MetricRow label="Plan" value={`${drawer.plan} · ${drawer.subscription}`} />
                  <MetricRow label="MRR" value={inr(drawer.mrr)} />
                  <MetricRow label="Expiry" value={drawer.expiry} />
                  <MetricRow label="Registered" value={drawer.registered} />
                  <MetricRow label="Last active" value={drawer.lastActive} />
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <Link to="/owners/$ownerId" params={{ ownerId: drawer.id }}>Open full profile</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/properties" search={{ owner: drawer.id }}>
                      <Building2 aria-hidden className="mr-1.5 size-3.5" /> Properties
                    </Link>
                  </Button>
                  <ConfirmDialog
                    trigger={<Button variant="outline" size="sm" className="text-destructive">Suspend owner</Button>}
                    title={`Suspend ${drawer.company}?`}
                    description="This blocks all logins for this owner and every property they manage."
                    impact={[
                      `${drawer.properties} properties go offline`,
                      `${drawer.staff} staff accounts lose access`,
                      "Channel manager stops syncing inventory",
                    ]}
                    confirmLabel="Suspend owner"
                  />
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
