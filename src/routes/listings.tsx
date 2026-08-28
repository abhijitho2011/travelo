import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { DataTable, type Column } from "@/components/admin/data-table";
import { PageHeader, StatusBadge } from "@/components/admin/primitives";
import { Input } from "@/components/ui/input";
import type { Property } from "@/hooks/api/types";
import { useProperties } from "@/hooks/api/use-properties";
import { humanise, num } from "@/lib/format";

export const Route = createFileRoute("/listings")({
  head: () => ({
    meta: [
      { title: "Listings · Tavelo Super Admin" },
      { name: "description", content: "Hotel listing quality and completeness across the platform." },
    ],
  }),
  component: ListingsPage,
});

const LIMIT = 25;

function ListingsPage() {
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);

  const query = useProperties({ limit: LIMIT, offset, q: q.trim() || undefined });
  const page = query.data;

  const columns: Column<Property>[] = [
    {
      key: "name",
      header: "Hotel",
      cell: (row) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">{row.name}</div>
          <div className="truncate text-xs text-muted-foreground">
            {[row.city, row.state].filter(Boolean).join(", ") || "Location not set"}
          </div>
        </div>
      ),
    },
    {
      key: "owner",
      header: "Owner",
      cell: (row) => <span className="text-muted-foreground">{row.owner ?? "—"}</span>,
    },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: "stars",
      header: "Rating",
      cell: (row) => (
        <span className="text-muted-foreground">
          {row.starRating ? `${row.starRating}-star` : "—"}
        </span>
      ),
    },
    {
      key: "rooms",
      header: "Rooms",
      align: "right",
      cell: (row) => <span className="text-muted-foreground">{num(row.roomCount)}</span>,
    },
    {
      key: "category",
      header: "Category",
      cell: (row) => <span className="text-muted-foreground">{humanise(row.category)}</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Listings"
        description="Listing content and completeness for every hotel published on Tavelo."
      />

      <DataTable
        rows={page?.items ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        emptyTitle="No listings"
        emptyDescription="Hotel listings appear once owners add properties."
        toolbar={
          <Input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setOffset(0);
            }}
            placeholder="Search hotels"
            className="h-8 max-w-xs"
          />
        }
        pagination={{ total: page?.total ?? 0, limit: LIMIT, offset, onOffsetChange: setOffset }}
      />
    </div>
  );
}
