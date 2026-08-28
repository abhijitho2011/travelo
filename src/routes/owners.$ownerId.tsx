import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { CalendarPlus, MoreHorizontal, Building2, UserSearch } from "lucide-react";
import {
  Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { DataTable, type Column } from "@/components/admin/data-table";
import { ExtendSubscriptionDialog } from "@/components/admin/extend-subscription";
import {
  EmptyState, KpiCard, MetricRow, OwnershipTrail, PageHeader, ScoreBar, Section, StatusBadge, Timeline,
} from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  activityFeed, auditLogs, inr, invoices, owners, payments, properties, revenueSeries, staff,
  tickets, type Property,
} from "@/lib/travelo-data";

export const Route = createFileRoute("/owners/$ownerId")({
  loader: ({ params }) => {
    const owner = owners.find((o) => o.id === params.ownerId);
    if (!owner) throw notFound();
    return { owner };
  },
  head: ({ loaderData }) => {
    const name = loaderData?.owner.company ?? "Owner";
    return {
      meta: [
        { title: `${name} · Owner 360 · Travelo Super Admin` },
        { name: "description", content: `Owner 360 for ${name}: properties, staff, subscription, billing, activity and audit.` },
        { property: "og:title", content: `${name} · Owner 360` },
        { property: "og:description", content: `Complete account view for ${name} on the Travelo platform.` },
      ],
    };
  },
  errorComponent: () => (
    <div className="p-6">
      <Section>
        <EmptyState title="Owner failed to load" description="The owner record could not be fetched. Retry from the owners list." />
      </Section>
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-6">
      <Section>
        <EmptyState
          title="Owner not found"
          description="This owner ID does not exist or was deleted."
          action={<Button asChild size="sm"><Link to="/owners">Back to owners</Link></Button>}
        />
      </Section>
    </div>
  ),
  component: OwnerDetail,
});

function OwnerDetail() {
  const { owner } = Route.useLoaderData();
  const ownerProperties = properties.filter((p) => p.ownerId === owner.id);
  const ownerStaff = staff.filter((s) => s.owner === owner.company);
  const ownerTickets = tickets.filter((t) => t.ownerId === owner.id);
  const ownerPayments = payments.filter((p) => p.ownerId === owner.id);
  const ownerInvoices = invoices.filter((i) => i.ownerId === owner.id);
  const ownerAudit = auditLogs.filter((a) => a.owner === owner.company);
  const ownerActivity = activityFeed.filter((a) => a.owner === owner.company);

  const propertyColumns: Column<Property>[] = [
    {
      key: "hotel", header: "Hotel", sortValue: (p) => p.name,
      cell: (p) => (
        <Link to="/properties/$propertyId" params={{ propertyId: p.id }} className="font-semibold hover:text-primary hover:underline">
          {p.name}
        </Link>
      ),
    },
    { key: "location", header: "Location", cell: (p) => <span className="text-muted-foreground">{p.location}</span> },
    { key: "rooms", header: "Rooms", align: "right", sortValue: (p) => p.rooms, cell: (p) => <span className="tnum">{p.rooms}</span> },
    { key: "occ", header: "Occupancy", align: "right", sortValue: (p) => p.occupancy, cell: (p) => <span className="tnum">{p.occupancy}%</span> },
    { key: "rev", header: "Revenue (MTD)", align: "right", sortValue: (p) => p.revenue, cell: (p) => <span className="tnum">{inr(p.revenue)}</span> },
    { key: "gm", header: "GM", cell: (p) => p.gm },
    { key: "agm", header: "AGM", optional: true, cell: (p) => p.agm },
    { key: "status", header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
    { key: "listing", header: "Listing", cell: (p) => <StatusBadge status={p.listing} /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Owner 360"
        title={owner.company}
        description={`${owner.name} · ${owner.email} · ${owner.city}, ${owner.country}`}
        breadcrumbs={[{ label: "Owners", to: "/owners" }, { label: owner.company }]}
        actions={
          <>
            <ExtendSubscriptionDialog owner={owner} />
            <Button asChild variant="outline" size="sm" className="h-8">
              <Link to="/impersonation" search={{ owner: owner.company }}>
                <UserSearch aria-hidden className="mr-1.5 size-3.5" /> Support access
              </Link>
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="icon" className="size-8" aria-label="More owner actions">
                  <MoreHorizontal aria-hidden className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild><Link to="/subscriptions">Change plan</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/subscriptions">Adjust property limit</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/invoices">Billing history</Link></DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </>
        }
      />

      <div className="space-y-4 p-4 lg:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={owner.status} />
          <OwnershipTrail nodes={[{ label: "Platform", to: "/" }, { label: owner.company }, { label: `${owner.properties} properties` }]} />
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard label="Properties" value={String(owner.properties)} hint={`limit ${owner.properties + 1}`} />
          <KpiCard label="Rooms" value={String(owner.rooms)} hint="managed" />
          <KpiCard label="Staff" value={String(owner.staff)} hint="active accounts" />
          <KpiCard label="MRR" value={inr(owner.mrr)} delta="+4.2%" hint="this month" />
          <KpiCard label="Lifetime value" value={inr(owner.mrr * 26)} hint="since signup" />
          <KpiCard label="Expires" value={owner.expiry} trend="down" delta={owner.subscription} />
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="flex w-full flex-wrap justify-start">
            {["overview", "properties", "staff", "subscription", "billing", "activity", "support", "audit"].map((t) => (
              <TabsTrigger key={t} value={t} className="capitalize">{t}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="mt-4 grid gap-4 xl:grid-cols-3">
            <Section className="xl:col-span-2" title="Revenue contribution">
              <div className="h-[240px] p-3">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={revenueSeries.map((r) => ({ ...r, own: Math.round(r.mrr / 40) }))}>
                    <CartesianGrid stroke="var(--color-border)" vertical={false} />
                    <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} stroke="var(--color-muted-foreground)" />
                    <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="var(--color-muted-foreground)" tickFormatter={(v: number) => `₹${(v / 1000).toFixed(0)}K`} />
                    <Tooltip contentStyle={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 8, fontSize: 12 }} />
                    <Area type="monotone" dataKey="own" name="Monthly value" stroke="var(--color-chart-1)" fill="var(--color-primary-soft)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </Section>
            <Section title="Account">
              <div className="p-4">
                <dl>
                  <MetricRow label="Owner ID" value={owner.id} />
                  <MetricRow label="Contact" value={owner.phone} />
                  <MetricRow label="Registered" value={owner.registered} />
                  <MetricRow label="Last login" value={owner.lastActive} />
                  <MetricRow label="Plan" value={`${owner.plan} · ${owner.subscription}`} />
                  <MetricRow label="Subscription" value={<StatusBadge status={owner.status} />} />
                  <MetricRow label="Open tickets" value={ownerTickets.filter((t) => !["Resolved", "Closed"].includes(t.status)).length} />
                </dl>
                <div className="mt-3">
                  <ScoreBar value={Math.round(ownerProperties.reduce((a, p) => a + p.completeness, 0) / Math.max(1, ownerProperties.length))} label="Avg listing completeness" />
                </div>
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="properties" className="mt-4">
            <DataTable
              rows={ownerProperties}
              columns={propertyColumns}
              rowKey={(p) => p.id}
              searchKeys={(p) => `${p.name} ${p.location} ${p.gm}`}
              exportName="Properties"
              pageSize={6}
              emptyTitle="No properties yet"
              emptyDescription="This owner hasn't created any hotels. They can add properties from their owner portal."
              emptyAction={<Button asChild size="sm" variant="outline"><Link to="/properties"><Building2 aria-hidden className="mr-1.5 size-3.5" /> All properties</Link></Button>}
            />
          </TabsContent>

          <TabsContent value="staff" className="mt-4">
            <DataTable
              rows={ownerStaff}
              columns={[
                { key: "name", header: "Employee", sortValue: (s) => s.name, cell: (s) => <span className="font-semibold">{s.name}</span> },
                { key: "hotel", header: "Hotel", cell: (s) => <span className="text-muted-foreground">{s.hotel}</span> },
                { key: "dept", header: "Department", cell: (s) => s.department },
                { key: "role", header: "Role", cell: (s) => s.role },
                { key: "status", header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
                { key: "login", header: "Last login", cell: (s) => <span className="text-muted-foreground">{s.lastLogin}</span> },
              ]}
              rowKey={(s) => s.name}
              searchKeys={(s) => `${s.name} ${s.hotel} ${s.role}`}
              pageSize={6}
              exportName="Staff"
              emptyTitle="No staff accounts"
              emptyDescription="Staff appear here once the owner's GM invites their team."
            />
          </TabsContent>

          <TabsContent value="subscription" className="mt-4 grid gap-4 lg:grid-cols-2">
            <Section title="Current subscription" actions={<ExtendSubscriptionDialog owner={owner} />}>
              <div className="p-4">
                <dl>
                  <MetricRow label="Plan" value={owner.plan} />
                  <MetricRow label="Billing cycle" value={owner.subscription} />
                  <MetricRow label="Monthly value" value={inr(owner.mrr)} />
                  <MetricRow label="Annual value" value={inr(owner.mrr * 12)} />
                  <MetricRow label="Property allowance" value={`${owner.properties} of ${owner.properties + 1} used`} />
                  <MetricRow label="Started" value={owner.registered} />
                  <MetricRow label="Expires" value={owner.expiry} />
                  <MetricRow label="Auto renewal" value={owner.status === "Expired" ? "Off" : "On"} />
                </dl>
              </div>
            </Section>
            <Section title="Danger zone" description="Destructive changes require a reason and are audited.">
              <div className="flex flex-wrap gap-2 p-4">
                <ConfirmDialog
                  trigger={<Button variant="outline" size="sm">Cancel subscription</Button>}
                  title={`Cancel subscription for ${owner.company}?`}
                  description="The account stays readable until expiry, then loses access to all modules."
                  impact={["Auto renewal disabled", "Booking engine offline at expiry", "Channel sync stops at expiry"]}
                  confirmLabel="Cancel subscription"
                />
                <ConfirmDialog
                  trigger={<Button variant="outline" size="sm" className="text-destructive">Suspend owner</Button>}
                  title={`Suspend ${owner.company}?`}
                  description="Immediately blocks all logins across the account."
                  impact={[`${owner.properties} properties go offline`, `${owner.staff} staff accounts blocked`]}
                  confirmLabel="Suspend owner"
                />
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="billing" className="mt-4 space-y-4">
            <DataTable
              rows={ownerPayments}
              columns={[
                { key: "id", header: "Payment", cell: (p) => <span className="font-mono text-xs">{p.id}</span> },
                { key: "amount", header: "Amount", align: "right", sortValue: (p) => p.amount, cell: (p) => <span className="tnum">{inr(p.amount)}</span> },
                { key: "method", header: "Method", cell: (p) => <span className="text-muted-foreground">{p.method}</span> },
                { key: "date", header: "Date", cell: (p) => <span className="tnum">{p.date}</span> },
                { key: "status", header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
              ]}
              rowKey={(p) => p.id}
              pageSize={5}
              exportName="Payments"
              emptyTitle="No payments recorded"
              emptyDescription="Payments show up here as soon as the first invoice is settled."
            />
            <DataTable
              rows={ownerInvoices}
              columns={[
                { key: "id", header: "Invoice #", cell: (i) => <span className="font-mono text-xs">{i.id}</span> },
                { key: "period", header: "Period", cell: (i) => i.period },
                { key: "total", header: "Total", align: "right", sortValue: (i) => i.total, cell: (i) => <span className="tnum">{inr(i.total)}</span> },
                { key: "status", header: "Status", cell: (i) => <StatusBadge status={i.status} /> },
                { key: "due", header: "Due", cell: (i) => <span className="tnum">{i.due}</span> },
              ]}
              rowKey={(i) => i.id}
              pageSize={5}
              exportName="Invoices"
              emptyTitle="No invoices"
              emptyDescription="Invoices are generated at the start of each billing period."
            />
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <Section title="Account activity">
              <div className="px-4 py-2">
                {ownerActivity.length > 0 ? (
                  <Timeline items={ownerActivity} />
                ) : (
                  <EmptyState title="No recent activity" description="Owner and staff actions from the last 30 days will appear here." />
                )}
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="support" className="mt-4">
            <DataTable
              rows={ownerTickets}
              columns={[
                { key: "id", header: "Ticket", cell: (t) => <Link to="/support/$ticketId" params={{ ticketId: t.id }} className="font-mono text-xs text-primary hover:underline">{t.id}</Link> },
                { key: "subject", header: "Subject", cell: (t) => <span className="font-medium">{t.subject}</span> },
                { key: "priority", header: "Priority", cell: (t) => <StatusBadge status={t.priority} /> },
                { key: "status", header: "Status", cell: (t) => <StatusBadge status={t.status} /> },
                { key: "updated", header: "Updated", cell: (t) => <span className="text-muted-foreground">{t.updated}</span> },
              ]}
              rowKey={(t) => t.id}
              pageSize={5}
              exportName="Tickets"
              emptyTitle="No support tickets"
              emptyDescription="This owner has not raised any tickets."
            />
          </TabsContent>

          <TabsContent value="audit" className="mt-4">
            <DataTable
              rows={ownerAudit}
              columns={[
                { key: "ts", header: "Timestamp", cell: (a) => <span className="tnum text-xs">{a.ts}</span> },
                { key: "actor", header: "Actor", cell: (a) => <span className="font-medium">{a.actor}</span> },
                { key: "action", header: "Action", cell: (a) => a.action },
                { key: "entity", header: "Entity", cell: (a) => <span className="font-mono text-xs">{a.entity}</span> },
                { key: "ip", header: "IP", optional: true, cell: (a) => <span className="font-mono text-xs text-muted-foreground">{a.ip}</span> },
              ]}
              rowKey={(a) => a.ts}
              pageSize={5}
              exportName="Audit"
              emptyTitle="No audit records"
              emptyDescription="Administrative changes on this account will be recorded here."
              emptyAction={<Button asChild variant="outline" size="sm"><Link to="/audit"><CalendarPlus aria-hidden className="mr-1.5 size-3.5" /> Platform audit log</Link></Button>}
            />
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
