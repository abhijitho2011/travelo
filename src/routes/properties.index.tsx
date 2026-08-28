import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";

import { DataTable, type Column } from "@/components/admin/data-table";
import { SearchBox, StatusFilter, ToolbarActions } from "@/components/admin/list-toolbar";
import { PageHeader, StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import type { Property } from "@/hooks/api/types";
import { useProperties } from "@/hooks/api/use-properties";
import { useListParams } from "@/hooks/use-list-params";
import { formatDate, num } from "@/lib/format";

export const Route = createFileRoute("/properties/")({
  head: () => ({
    meta: [
      { title: "Properties · Tavelo Super Admin" },
      { name: "description", content: "Every hotel managed on the Tavelo platform." },
    ],
  }),
  component: PropertiesPage,
});

const PROPERTY_STATUSES = ["ACTIVE", "DRAFT", "PENDING", "SUSPENDED", "ARCHIVED"];

function PropertiesPage() {
  const navigate = useNavigate();
  const list = useListParams();
  const query = useProperties({
    limit: list.limit,
    offset: list.offset,
    q: list.q,
    status: list.statusParam,
  });

  const columns: Column<Property>[] = [
    {
      key: "name",
      header: "Property",
      cell: (p) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{p.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[p.city, p.state, p.country].filter(Boolean).join(", ") || "—"}
          </p>
        </div>
      ),
    },
    {
      key: "owner",
      header: "Owner",
      cell: (p) =>
        p.owner ? (
          <Link
            to="/owners/$ownerId"
            params={{ ownerId: p.ownerId }}
            className="text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {p.owner}
          </Link>
        ) : (
          "—"
        ),
    },
    { key: "category", header: "Category", cell: (p) => p.category ?? "—" },
    {
      key: "stars",
      header: "Rating",
      cell: (p) => (p.starRating ? `${p.starRating}★` : "—"),
    },
    { key: "rooms", header: "Rooms", align: "right", cell: (p) => num(p.roomCount) },
    { key: "status", header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
    { key: "created", header: "Onboarded", cell: (p) => formatDate(p.createdAt) },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Customers"
        title="Properties"
        description="Hotels onboarded across every owner account."
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
          emptyTitle="No properties match this view"
          emptyDescription="Adjust the search or status filter to widen the results."
          emptyAction={
            <Button asChild size="sm" variant="outline">
              <Link to="/owners">Browse owners</Link>
            </Button>
          }
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
