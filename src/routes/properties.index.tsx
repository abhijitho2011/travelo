import { createFileRoute, Link } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable, type Column } from "@/components/admin/data-table";
import { KpiCard, MetricRow, PageHeader, ScoreBar, StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { inr, properties, type Property } from "@/lib/travelo-data";

export const Route = createFileRoute("/properties/")({
  head: () => ({
    meta: [
      { title: "Properties · Travelo Super Admin" },
      { name: "description", content: "Monitor every hotel and resort on the platform: rooms, occupancy, revenue and listing state." },
      { property: "og:title", content: "Properties · Travelo Super Admin" },
      { property: "og:description", content: "Platform-wide hotel and resort monitoring." },
    ],
  }),
  component: PropertiesPage,
});

function PropertiesPage() {
  const [status, setStatus] = useState("all");
  const [drawer, setDrawer] = useState<Property | null>(null);
  const rows = properties.filter((p) => status === "all" || p.status === status);

  const columns: Column<Property>[] = [
    {
      key: "hotel", header: "Hotel", sortValue: (p) => p.name,
      cell: (p) => (
        <div className="min-w-0">
          <Link
            to="/properties/$propertyId"
            params={{ propertyId: p.id }}
            onClick={(e) => e.stopPropagation()}
            className="block truncate font-semibold hover:text-primary hover:underline"
          >
            {p.name}
          </Link>
          <span className="block truncate text-xs text-muted-foreground">
            {p.stars}★ {p.category} · {p.location}
          </span>
        </div>
      ),
    },
    {
      key: "owner", header: "Owner", sortValue: (p) => p.owner,
      cell: (p) => (
        <Link to="/owners/$ownerId" params={{ ownerId: p.ownerId }} onClick={(e) => e.stopPropagation()} className="text-muted-foreground hover:text-primary hover:underline">
          {p.owner}
        </Link>
      ),
    },
    { key: "rooms", header: "Rooms", align: "right", sortValue: (p) => p.rooms, cell: (p) => <span className="tnum">{p.rooms}</span> },
    { key: "occ", header: "Occupancy", align: "right", sortValue: (p) => p.occupancy, cell: (p) => <span className="tnum">{p.occupancy}%</span> },
    { key: "rev", header: "Revenue (MTD)", align: "right", sortValue: (p) => p.revenue, cell: (p) => <span className="tnum">{inr(p.revenue)}</span> },
    { key: "gm", header: "GM", optional: true, cell: (p) => p.gm },
    { key: "status", header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
    { key: "listing", header: "Listing", cell: (p) => <StatusBadge status={p.listing} /> },
  ];

  const totalRooms = properties.reduce((a, p) => a + p.rooms, 0);
  const active = properties.filter((p) => p.status === "Active").length;

  return (
    <>
      <PageHeader
        eyebrow="Customers"
        title="Properties"
        description="All hotels and resorts across every owner account."
        breadcrumbs={[{ label: "Super Admin", to: "/" }, { label: "Properties" }]}
      />
      <div className="space-y-4 p-4 lg:p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Properties" value={String(properties.length)} hint="in this view" />
          <KpiCard label="Active" value={String(active)} hint={`${properties.length - active} suspended`} />
          <KpiCard label="Rooms" value={totalRooms.toLocaleString("en-IN")} hint="managed inventory" />
          <KpiCard label="Avg occupancy" value={`${Math.round(properties.reduce((a, p) => a + p.occupancy, 0) / properties.length)}%`} delta="+3.1%" />
        </div>

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(p) => p.id}
          searchKeys={(p) => `${p.name} ${p.owner} ${p.location} ${p.gm}`}
          searchPlaceholder="Search hotel, owner, city…"
          exportName="Properties"
          onRowClick={(p) => setDrawer(p)}
          filters={
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 w-[150px] text-sm" aria-label="Filter by status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="Active">Active</SelectItem>
                <SelectItem value="Suspended">Suspended</SelectItem>
              </SelectContent>
            </Select>
          }
          rowActions={(p) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7" aria-label={`Actions for ${p.name}`}>
                  <MoreHorizontal aria-hidden className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link to="/properties/$propertyId" params={{ propertyId: p.id }}>Open property 360</Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/listings">Review listing</Link></DropdownMenuItem>
                <DropdownMenuItem asChild><Link to="/integrations">Integration health</Link></DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.info(`Monitoring ${p.name}`, { description: "Live operations stream opened." })}>
                  Monitor operations
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          emptyTitle="No properties match"
          emptyDescription="Adjust the filters, or onboard an owner so they can create hotels."
        />
      </div>

      <Sheet open={!!drawer} onOpenChange={(o) => !o && setDrawer(null)}>
        <SheetContent className="w-full sm:max-w-md">
          {drawer && (
            <>
              <SheetHeader>
                <SheetTitle>{drawer.name}</SheetTitle>
                <SheetDescription>{drawer.owner} · {drawer.id}</SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <div className="flex gap-2">
                  <StatusBadge status={drawer.status} />
                  <StatusBadge status={drawer.listing} />
                </div>
                <dl>
                  <MetricRow label="Category" value={`${drawer.stars}★ ${drawer.category}`} />
                  <MetricRow label="Location" value={drawer.location} />
                  <MetricRow label="Rooms" value={drawer.rooms} />
                  <MetricRow label="Occupancy" value={`${drawer.occupancy}%`} />
                  <MetricRow label="Revenue (MTD)" value={inr(drawer.revenue)} />
                  <MetricRow label="GM" value={drawer.gm} />
                  <MetricRow label="AGM" value={drawer.agm} />
                  <MetricRow label="Updated" value={drawer.updated} />
                </dl>
                <ScoreBar value={drawer.completeness} label="Listing completeness" />
                <div className="flex flex-wrap gap-2">
                  <Button asChild size="sm">
                    <Link to="/properties/$propertyId" params={{ propertyId: drawer.id }}>Open property 360</Link>
                  </Button>
                  <Button asChild variant="outline" size="sm">
                    <Link to="/owners/$ownerId" params={{ ownerId: drawer.ownerId }}>Owner 360</Link>
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
