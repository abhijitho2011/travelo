import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable, type Column } from "@/components/admin/data-table";
import { KpiCard, PageHeader, ScoreBar, Section, StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { listingChecklist, properties } from "@/lib/travelo-data";

export const Route = createFileRoute("/listings")({
  head: () => ({
    meta: [
      { title: "Property Listings · Travelo Super Admin" },
      { name: "description", content: "Review listing completeness, approve or unpublish hotel listings and request missing content from owners." },
      { property: "og:title", content: "Property Listings · Travelo Super Admin" },
      { property: "og:description", content: "Listing quality control for every Travelo property." },
    ],
  }),
  component: ListingsPage,
});

type Prop = (typeof properties)[number];

function ListingsPage() {
  const [state, setState] = useState("all");
  const rows = properties.filter((p) => state === "all" || p.listing === state);

  const columns: Column<Prop>[] = [
    {
      key: "name", header: "Property", sortValue: (p) => p.name,
      cell: (p) => (
        <Link to="/properties/$propertyId" params={{ propertyId: p.id }} className="font-semibold hover:text-primary hover:underline">
          {p.name}
        </Link>
      ),
    },
    { key: "owner", header: "Owner", optional: true, cell: (p) => <span className="text-muted-foreground">{p.owner}</span> },
    { key: "location", header: "Location", cell: (p) => <span className="text-muted-foreground">{p.location}</span> },
    { key: "rooms", header: "Rooms", align: "right", sortValue: (p) => p.rooms, cell: (p) => <span className="tnum">{p.rooms}</span> },
    {
      key: "score", header: "Completeness", sortValue: (p) => p.completeness,
      cell: (p) => <ScoreBar value={p.completeness} />,
    },
    { key: "listing", header: "Listing state", cell: (p) => <StatusBadge status={p.listing} /> },
    { key: "updated", header: "Updated", cell: (p) => <span className="text-muted-foreground">{p.updated}</span> },
    {
      key: "actions", header: "",
      cell: (p) => (
        <span className="flex justify-end gap-1.5">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => toast.success(`${p.name} listing approved`)}>Approve</Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toast.info(`Change request sent for ${p.name}`)}>Request changes</Button>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Property Listings"
        description="Quality gate for guest-facing content: photos, room types, amenities and policies."
        breadcrumbs={[{ label: "Super Admin", to: "/" }, { label: "Property Listings" }]}
      />
      <div className="space-y-4 p-4 lg:p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Published" value="548" delta="+22" hint="89.5% of properties" />
          <KpiCard label="Awaiting review" value="27" trend="down" delta="avg 1.4 days" />
          <KpiCard label="Incomplete (< 70%)" value="34" trend="down" delta="content missing" />
          <KpiCard label="Average completeness" value="87%" delta="+3 pts" />
        </div>

        <Section title="Completeness by section" description="Weighted average across all published listings">
          <div className="grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-4">
            {listingChecklist.map((c, i) => (
              <ScoreBar key={c.label} label={`${c.label} (${c.weight}%)`} value={[94, 71, 88, 92, 79, 96, 84][i] ?? 80} />
            ))}
          </div>
        </Section>

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(p) => p.id}
          searchKeys={(p) => `${p.name} ${p.owner} ${p.location}`}
          searchPlaceholder="Search property, owner or city…"
          exportName="Listings"
          filters={
            <Select value={state} onValueChange={setState}>
              <SelectTrigger className="h-8 w-[170px] text-sm" aria-label="Filter by listing state">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All listings</SelectItem>
                <SelectItem value="Published">Published</SelectItem>
                <SelectItem value="Unpublished">Unpublished</SelectItem>
                <SelectItem value="Draft">Draft</SelectItem>
              </SelectContent>
            </Select>
          }
          emptyTitle="No listings match"
          emptyDescription="Change the filter to review other listing states."
        />
      </div>
    </>
  );
}
