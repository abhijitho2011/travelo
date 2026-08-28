import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { DataTable, type Column } from "@/components/admin/data-table";
import { PageHeader, StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import type { IntegrationConnection } from "@/hooks/api/types";
import { useIntegrations } from "@/hooks/api/use-operations";
import { humanise, relativeTime, shortId } from "@/lib/format";

export const Route = createFileRoute("/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations · Tavelo Super Admin" },
      {
        name: "description",
        content: "Channel manager and distribution integration health across the platform.",
      },
    ],
  }),
  component: IntegrationsPage,
});

const STATUSES = ["", "HEALTHY", "WARNING", "ERROR", "DISCONNECTED"];
const LIMIT = 25;

function IntegrationsPage() {
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);

  const query = useIntegrations({ limit: LIMIT, offset, status: status || undefined });
  const page = query.data;

  const columns: Column<IntegrationConnection>[] = [
    {
      key: "provider",
      header: "Provider",
      cell: (row) => <span className="font-medium text-foreground">{humanise(row.provider)}</span>,
    },
    {
      key: "status",
      header: "Status",
      cell: (row) => <StatusBadge status={row.status} />,
    },
    {
      key: "property",
      header: "Property",
      cell: (row) => (
        <span className="text-muted-foreground">
          {row.propertyId ? shortId(row.propertyId) : "—"}
        </span>
      ),
    },
    {
      key: "lastSync",
      header: "Last sync",
      cell: (row) => <span className="text-muted-foreground">{relativeTime(row.lastSyncAt)}</span>,
    },
    {
      key: "errors",
      header: "Errors",
      align: "right",
      cell: (row) => (
        <span className={row.errorCount ? "text-destructive" : "text-muted-foreground"}>
          {row.errorCount ?? 0}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Integrations"
        description="Connection health for channel managers and distribution partners."
      />

      <DataTable
        rows={page?.items ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        emptyTitle="No integrations connected"
        emptyDescription="Integration health appears once a property connects a channel manager."
        toolbar={
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((value) => (
              <Button
                key={value || "all"}
                size="sm"
                variant={status === value ? "default" : "outline"}
                onClick={() => {
                  setStatus(value);
                  setOffset(0);
                }}
              >
                {value ? humanise(value) : "All"}
              </Button>
            ))}
          </div>
        }
        pagination={{
          total: page?.total ?? 0,
          limit: LIMIT,
          offset,
          onOffsetChange: setOffset,
        }}
      />
    </div>
  );
}
