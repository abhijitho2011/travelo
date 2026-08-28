import { createFileRoute } from "@tanstack/react-router";

import { DataTable, type Column } from "@/components/admin/data-table";
import { ToolbarActions } from "@/components/admin/list-toolbar";
import { PageHeader } from "@/components/admin/primitives";
import type { AuditLog } from "@/hooks/api/types";
import { useAuditLogs } from "@/hooks/api/use-operations";
import { useListParams } from "@/hooks/use-list-params";
import { formatDateTime, humanise, relativeTime } from "@/lib/format";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Owner activity · Tavelo Super Admin" },
      { name: "description", content: "Recent admin actions taken against owner accounts." },
    ],
  }),
  component: ActivityPage,
});

function ActivityPage() {
  const list = useListParams();
  // Owner activity is the owner-scoped slice of the platform audit trail.
  const query = useAuditLogs({ limit: list.limit, offset: list.offset, entity: "owner" });

  const columns: Column<AuditLog>[] = [
    { key: "ts", header: "When", cell: (l) => formatDateTime(l.ts) },
    {
      key: "action",
      header: "Action",
      cell: (l) => <span className="font-medium">{humanise(l.action.replace(/\./g, " "))}</span>,
    },
    {
      key: "entity",
      header: "Owner",
      cell: (l) => (
        <span className="font-mono text-xs text-muted-foreground">{l.entityId ?? "—"}</span>
      ),
    },
    { key: "actor", header: "Admin", cell: (l) => l.actor ?? "—" },
    {
      key: "reason",
      header: "Reason",
      cell: (l) => <span className="text-xs text-muted-foreground">{l.reason ?? "—"}</span>,
    },
    { key: "ago", header: "Age", cell: (l) => relativeTime(l.ts) },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Customers"
        title="Owner activity"
        description="Every admin action recorded against an owner account."
      />
      <div className="p-5 lg:p-6">
        <DataTable
          rows={query.data?.items ?? []}
          columns={columns}
          rowKey={(l) => l.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          emptyTitle="No owner activity yet"
          emptyDescription="Status changes and edits to owner accounts appear here."
          pagination={{
            total: query.data?.total ?? 0,
            limit: list.limit,
            offset: list.offset,
            onOffsetChange: list.setOffset,
          }}
          toolbar={
            <ToolbarActions>
              <span className="tnum text-xs text-muted-foreground">
                {query.data?.total ?? 0} entries
              </span>
            </ToolbarActions>
          }
        />
      </div>
    </>
  );
}
