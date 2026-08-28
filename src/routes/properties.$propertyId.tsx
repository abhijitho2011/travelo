import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import {
  EmptyState, KpiCard, MetricRow, OwnershipTrail, PageHeader, ScoreBar, Section, StatusBadge, Timeline,
} from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  inr, integrations, listingChecklist, owners, properties, staff,
} from "@/lib/travelo-data";

export const Route = createFileRoute("/properties/$propertyId")({
  loader: ({ params }) => {
    const property = properties.find((p) => p.id === params.propertyId);
    if (!property) throw notFound();
    return { property };
  },
  head: ({ loaderData }) => {
    const name = loaderData?.property.name ?? "Property";
    return {
      meta: [
        { title: `${name} · Property 360 · Travelo Super Admin` },
        { name: "description", content: `Operations, management, integrations and activity for ${name}.` },
        { property: "og:title", content: `${name} · Property 360` },
        { property: "og:description", content: `Property monitoring view for ${name}.` },
      ],
    };
  },
  errorComponent: () => (
    <div className="p-6">
      <Section>
        <EmptyState title="Property failed to load" description="The property record could not be fetched. Retry from the properties list." />
      </Section>
    </div>
  ),
  notFoundComponent: () => (
    <div className="p-6">
      <Section>
        <EmptyState
          title="Property not found"
          description="This property ID does not exist."
          action={<Button asChild size="sm"><Link to="/properties">Back to properties</Link></Button>}
        />
      </Section>
    </div>
  ),
  component: PropertyDetail,
});

function PropertyDetail() {
  const { property } = Route.useLoaderData();
  const owner = owners.find((o) => o.id === property.ownerId);
  const hotelStaff = staff.filter((s) => s.hotel === property.name);

  return (
    <>
      <PageHeader
        eyebrow="Property 360"
        title={property.name}
        description={`${property.stars}★ ${property.category} · ${property.location} · ${property.rooms} rooms`}
        breadcrumbs={[
          { label: "Properties", to: "/properties" },
          { label: property.name },
        ]}
        actions={
          <>
            <Button variant="outline" size="sm" className="h-8" onClick={() => toast.success("Resync queued", { description: "Channex inventory and rates will resync within a minute." })}>
              <RefreshCw aria-hidden className="mr-1.5 size-3.5" /> Resync channels
            </Button>
            <ConfirmDialog
              trigger={<Button variant="outline" size="sm" className="h-8 text-destructive">Suspend property</Button>}
              title={`Suspend ${property.name}?`}
              description="Suspension takes the property offline for guests and staff immediately."
              impact={["Booking engine unpublished", "Channel inventory zeroed", "Staff limited to read-only"]}
              confirmLabel="Suspend property"
            />
          </>
        }
      />

      <div className="space-y-4 p-4 lg:p-6">
        <div className="flex flex-wrap items-center gap-3">
          <StatusBadge status={property.status} />
          <StatusBadge status={property.listing} />
          <OwnershipTrail
            nodes={[
              { label: owner?.company ?? property.owner, to: `/owners/${property.ownerId}` },
              { label: property.name },
              { label: `${property.rooms} rooms` },
            ]}
          />
        </div>

        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
          <KpiCard label="Rooms" value={String(property.rooms)} hint={`${property.stars}★`} />
          <KpiCard label="Occupancy" value={`${property.occupancy}%`} delta="+2.4%" />
          <KpiCard label="Revenue (MTD)" value={inr(property.revenue)} delta="+5.1%" />
          <KpiCard label="Reservations (30d)" value={String(property.rooms * 9)} delta="+118" />
          <KpiCard label="Staff" value={String(Math.max(hotelStaff.length, Math.round(property.rooms / 3)))} hint="active accounts" />
          <KpiCard label="Listing score" value={`${property.completeness}%`} trend={property.completeness < 85 ? "down" : "up"} delta={property.completeness < 85 ? "needs work" : "healthy"} />
        </div>

        <Tabs defaultValue="overview">
          <TabsList className="flex w-full flex-wrap justify-start">
            {["overview", "management", "operations", "integration", "listing", "activity"].map((t) => (
              <TabsTrigger key={t} value={t} className="capitalize">{t}</TabsTrigger>
            ))}
          </TabsList>

          <TabsContent value="overview" className="mt-4 grid gap-4 lg:grid-cols-2">
            <Section title="Property information">
              <div className="p-4">
                <dl>
                  <MetricRow label="Property ID" value={property.id} />
                  <MetricRow label="Owner" value={<Link to="/owners/$ownerId" params={{ ownerId: property.ownerId }} className="text-primary hover:underline">{property.owner}</Link>} />
                  <MetricRow label="Category" value={`${property.stars}★ ${property.category}`} />
                  <MetricRow label="Location" value={property.location} />
                  <MetricRow label="Rooms" value={property.rooms} />
                  <MetricRow label="Room types" value="Deluxe · Premium · Suite · Villa" />
                  <MetricRow label="Amenities" value="Pool, Spa, Restaurant, Gym, Events" />
                  <MetricRow label="Status" value={<StatusBadge status={property.status} />} />
                </dl>
              </div>
            </Section>
            <Section title="Modules enabled">
              <ul className="grid grid-cols-2 gap-px bg-border">
                {["PMS", "Booking Engine", "Channel Manager", "Housekeeping", "Maintenance", "Restaurant / F&B", "Digital Check-in", "Key-card Management"].map((m) => (
                  <li key={m} className="flex items-center justify-between bg-surface px-3 py-2 text-sm">
                    <span>{m}</span>
                    <StatusBadge status="Active" />
                  </li>
                ))}
              </ul>
            </Section>
          </TabsContent>

          <TabsContent value="management" className="mt-4 grid gap-4 lg:grid-cols-2">
            <Section title="Management team">
              <div className="p-4">
                <dl>
                  <MetricRow label="General Manager" value={property.gm} />
                  <MetricRow label="AGM" value={property.agm} />
                  <MetricRow label="Departments" value="9" />
                  <MetricRow label="Total staff" value={Math.max(hotelStaff.length, Math.round(property.rooms / 3))} />
                  <MetricRow label="Active users (24h)" value={Math.round(property.rooms / 4)} />
                </dl>
              </div>
            </Section>
            <Section title="Staff accounts" actions={<Button asChild variant="ghost" size="sm" className="h-7 text-xs"><Link to="/staff">All staff</Link></Button>}>
              {hotelStaff.length > 0 ? (
                <ul className="divide-y divide-border">
                  {hotelStaff.map((s) => (
                    <li key={s.name} className="flex items-center justify-between px-4 py-2.5 text-sm">
                      <span>
                        <span className="block font-medium">{s.name}</span>
                        <span className="block text-xs text-muted-foreground">{s.role} · {s.department}</span>
                      </span>
                      <StatusBadge status={s.status} />
                    </li>
                  ))}
                </ul>
              ) : (
                <EmptyState title="No staff records" description="Staff accounts created by the GM will appear here." />
              )}
            </Section>
          </TabsContent>

          <TabsContent value="operations" className="mt-4">
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <KpiCard label="Arrivals today" value={String(Math.round(property.rooms * 0.22))} />
              <KpiCard label="Departures today" value={String(Math.round(property.rooms * 0.19))} />
              <KpiCard label="In-house guests" value={String(Math.round(property.rooms * property.occupancy / 100 * 1.8))} />
              <KpiCard label="F&B revenue (MTD)" value={inr(Math.round(property.revenue * 0.22))} />
              <KpiCard label="Open maintenance" value="7" trend="down" delta="2 overdue" />
              <KpiCard label="Rooms to clean" value={String(Math.round(property.rooms * 0.12))} />
            </div>
          </TabsContent>

          <TabsContent value="integration" className="mt-4">
            <Section title="Integration status" description="Owner-facing summary — vendor internals stay hidden.">
              <ul className="divide-y divide-border">
                {integrations.slice(0, 4).map((i) => (
                  <li key={i.name} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3">
                    <span>
                      <span className="block text-sm font-medium">{i.name}</span>
                      <span className="block text-xs text-muted-foreground">Last sync {i.lastSync} · {i.detail}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={i.status} />
                      <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => toast.success(`Retry queued for ${i.name}`)}>
                        Retry
                      </Button>
                    </span>
                  </li>
                ))}
              </ul>
            </Section>
          </TabsContent>

          <TabsContent value="listing" className="mt-4">
            <Section title="Listing quality" description={`Completeness ${property.completeness}%`}>
              <div className="grid gap-4 p-4 sm:grid-cols-2">
                {listingChecklist.map((c, i) => (
                  <ScoreBar
                    key={c.label}
                    label={c.label}
                    value={Math.max(20, Math.min(100, property.completeness + (i % 3 === 0 ? 8 : -6) * (i + 1) / 2))}
                  />
                ))}
              </div>
              <div className="flex flex-wrap gap-2 border-t border-border px-4 py-3">
                <Button size="sm" onClick={() => toast.success("Listing approved")}>Approve listing</Button>
                <Button variant="outline" size="sm" onClick={() => toast.info("Change request sent to owner")}>Request changes</Button>
                <Button variant="outline" size="sm" onClick={() => toast.success("Listing unpublished")}>Unpublish</Button>
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="activity" className="mt-4">
            <Section title="Property activity">
              <div className="px-4 py-2">
                <Timeline
                  items={[
                    { time: "18 min ago", text: "Rate plan 'Summer Flex' updated for Deluxe rooms", actor: property.gm, tone: "info" },
                    { time: "2 hours ago", text: "42 reservations imported from channel manager", actor: "System", tone: "success" },
                    { time: "5 hours ago", text: "Housekeeping shift closed with 3 pending rooms", actor: "Housekeeping", tone: "warning" },
                    { time: "yesterday", text: "Key-card encoder re-provisioned", actor: "Nishant Kumar (Travelo)", tone: "neutral" },
                    { time: "2 days ago", text: "Listing photos updated (12 new images)", actor: property.gm, tone: "info" },
                  ]}
                />
              </div>
            </Section>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}
