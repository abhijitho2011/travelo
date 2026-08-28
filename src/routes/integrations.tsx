import { createFileRoute, Link } from "@tanstack/react-router";

import { DataTable, type Column } from "@/components/admin/data-table";
import { StatusFilter, ToolbarActions } from "@/components/admin/list-toolbar";
import { PageHeader, StatusBadge } from "@/components/admin/primitives";
import type { IntegrationConnection } from "@/hooks/api/types";
import { useIntegrations } from "@/hooks/api/use-operations";
import { useListParams } from "@/hooks/use-list-params";
import { num, relativeTime } from "@/lib/format";

export const Route = createFileRoute("/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations · Tavelo Super Admin" },
      { name: "description", content: "Channel manager and PMS connections across properties." },
    ],
  }),
  component: IntegrationsPage,
});

const INTEGRATION_STATUSES = ["CONNECTED", "DEGRADED", "DISCONNECTED", "ERROR", "PENDING"];

function IntegrationsPage() {
  const list = useListParams();
  const query = useIntegrations({
    limit: list.limit,
    offset: list.offset,
    status: list.statusParam,
  });

  const columns: Column<IntegrationConnection>[] = [
    { key: "provider", header: "Provider", cell: (i) => i.provider },
    {
      key: "property",
      header: "Property",
      cell: (i) =>
        i.propertyId ? (
          <Link
            to="/properties/$propertyId"
            params={{ propertyId: i.propertyId }}
            className="text-primary hover:underline"
          >
            View property
          </Link>
        ) : (
          "—"
        ),
    },
    {
      key: "owner",
      header: "Owner",
      cell: (i) =>
        i.ownerId ? (
          <Link
            to="/owners/$ownerId"
            params={{ ownerId: i.ownerId }}
            className="text-primary hover:underline"
          >
            View owner
          </Link>
        ) : (
          "—"
        ),
    },
    { key: "status", header: "Status", cell: (i) => <StatusBadge status={i.status} /> },
    { key: "errors", header: "Errors", align: "right", cell: (i) => num(i.errorCount ?? 0) },
    { key: "sync", header: "Last sync", cell: (i) => relativeTime(i.lastSyncAt) },
    { key: "updated", header: "Updated", cell: (i) => relativeTime(i.updatedAt) },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Integrations"
        description="Channel manager and PMS connections, with their sync health."
      />
      <div className="p-5 lg:p-6">
        <DataTable
          rows={query.data?.items ?? []}
          columns={columns}
          rowKey={(i) => i.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          emptyTitle="No integrations"
          emptyDescription="Connections appear once owners link a channel manager or PMS."
          pagination={{
            total: query.data?.total ?? 0,
            limit: list.limit,
            offset: list.offset,
            onOffsetChange: list.setOffset,
          }}
          toolbar={
            <>
              <StatusFilter
                value={list.status}
                onChange={list.setStatus}
                options={INTEGRATION_STATUSES}
              />
              <ToolbarActions>
                <span className="tnum text-xs text-muted-foreground">
                  {query.data?.items?.length ?? 0} shown
                </span>
              </ToolbarActions>
            </>
          }
        />
      </div>
    </>
  );
}
