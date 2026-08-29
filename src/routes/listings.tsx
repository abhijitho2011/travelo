import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { DataTable, type Column } from "@/components/admin/data-table";
import {
  ClearFiltersButton,
  EMPTY_LOCATION,
  LocationFilter,
  type LocationFilterValue,
  SearchBox,
  StatusFilter,
  ToolbarActions,
} from "@/components/admin/list-toolbar";
import { PageHeader, ScoreBar, StatusBadge } from "@/components/admin/primitives";
import type { Property } from "@/hooks/api/types";
import { useProperties } from "@/hooks/api/use-properties";
import { useListParams } from "@/hooks/use-list-params";
import { num, relativeTime } from "@/lib/format";

export const Route = createFileRoute("/listings")({
  head: () => ({
    meta: [
      { title: "Property listings · Tavelo Super Admin" },
      { name: "description", content: "Listing completeness across every property." },
    ],
  }),
  component: ListingsPage,
});

const PROPERTY_STATUSES = ["ACTIVE", "DRAFT", "PENDING", "SUSPENDED", "ARCHIVED"];

/**
 * Listing completeness derived from the fields the properties endpoint returns.
 * The authoritative weighted score lives on the property detail screen, which
 * reads `/properties/:id/overview`.
 */
const CHECKS: { label: string; ok: (p: Property) => boolean }[] = [
  { label: "Name", ok: (p) => !!p.name },
  { label: "Category", ok: (p) => !!p.category },
  { label: "Star rating", ok: (p) => !!p.starRating },
  { label: "Rooms", ok: (p) => !!p.roomCount && p.roomCount > 0 },
  { label: "City", ok: (p) => !!p.city },
  { label: "Country", ok: (p) => !!p.country },
  { label: "Timezone", ok: (p) => !!p.timezone },
  { label: "Slug", ok: (p) => !!p.slug },
];

function completeness(p: Property) {
  const done = CHECKS.filter((c) => c.ok(p)).length;
  return Math.round((done / CHECKS.length) * 100);
}

function ListingsPage() {
  const navigate = useNavigate();
  const list = useListParams();
  const [location, setLocation] = useState<LocationFilterValue>(EMPTY_LOCATION);
  const query = useProperties({
    limit: list.limit,
    offset: list.offset,
    q: list.q,
    status: list.statusParam,
    // Properties store their location as text names — send the resolved names.
    state: location.stateName || undefined,
    district: location.districtName || undefined,
  });

  const changeLocation = (next: LocationFilterValue) => {
    setLocation(next);
    list.setOffset(0);
  };
  const filtersActive =
    !!list.search || !!list.status || !!location.stateId || !!location.districtId;
  const clearFilters = () => {
    list.setSearch("");
    list.setStatus("");
    changeLocation(EMPTY_LOCATION);
  };

  const columns: Column<Property>[] = [
    {
      key: "name",
      header: "Property",
      cell: (p) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{p.name}</p>
          <p className="truncate text-xs text-muted-foreground">{p.owner ?? "Unassigned owner"}</p>
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
    {
      key: "score",
      header: "Completeness",
      cell: (p) => <ScoreBar value={completeness(p)} />,
    },
    {
      key: "missing",
      header: "Missing fields",
      cell: (p) => {
        const missing = CHECKS.filter((c) => !c.ok(p)).map((c) => c.label);
        return missing.length === 0 ? (
          <span className="text-xs text-success">Complete</span>
        ) : (
          <span className="text-xs text-muted-foreground">{missing.join(", ")}</span>
        );
      },
    },
    { key: "rooms", header: "Rooms", align: "right", cell: (p) => num(p.roomCount) },
    { key: "updated", header: "Updated", cell: (p) => relativeTime(p.updatedAt) },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Property listings"
        description="How complete each listing is, and what is still missing."
      />
      <div className="p-5 lg:p-6">
        <DataTable
          rows={query.data?.items ?? []}
          columns={columns}
          rowKey={(p) => p.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          onRowClick={(p) =>
            navigate({ to: "/properties/$propertyId", params: { propertyId: p.id } })
          }
          emptyTitle="No listings match this view"
          emptyDescription="Adjust the search or status filter to widen the results."
          pagination={{
            total: query.data?.total ?? 0,
            limit: list.limit,
            offset: list.offset,
            onOffsetChange: list.setOffset,
          }}
          toolbar={
            <>
              <SearchBox
                value={list.search}
                onChange={list.setSearch}
                placeholder="Search by hotel name or city…"
              />
              <StatusFilter
                value={list.status}
                onChange={list.setStatus}
                options={PROPERTY_STATUSES}
              />
              <LocationFilter value={location} onChange={changeLocation} />
              <ClearFiltersButton show={filtersActive} onClear={clearFilters} />
              <ToolbarActions>
                <span className="tnum text-xs text-muted-foreground">
                  {query.data?.total ?? 0} total
                </span>
              </ToolbarActions>
            </>
          }
        />
      </div>
    </>
  );
}
