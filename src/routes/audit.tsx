import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { DataTable, type Column } from "@/components/admin/data-table";
import { PageHeader } from "@/components/admin/primitives";
import { Input } from "@/components/ui/input";
import type { AuditLog } from "@/hooks/api/types";
import { useAuditLogs } from "@/hooks/api/use-operations";
import { formatDateTime, humanise, shortId } from "@/lib/format";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Audit log · Tavelo Super Admin" },
      { name: "description", content: "Append-only record of every privileged action on Tavelo." },
    ],
  }),
  component: AuditPage,
});

const LIMIT = 25;

function AuditPage() {
  const [entity, setEntity] = useState("");
  const [offset, setOffset] = useState(0);

  const query = useAuditLogs({ limit: LIMIT, offset, entity: entity.trim() || undefined });
  const page = query.data;

  const columns: Column<AuditLog>[] = [
    {
      key: "ts",
      header: "When",
      cell: (row) => (
        <span className="whitespace-nowrap text-muted-foreground">{formatDateTime(row.ts)}</span>
      ),
    },
    {
      key: "actor",
      header: "Actor",
      cell: (row) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">{row.actor ?? "System"}</div>
          {row.role && <div className="truncate text-xs text-muted-foreground">{row.role}</div>}
        </div>
      ),
    },
    {
      key: "action",
      header: "Action",
      cell: (row) => <span className="font-medium text-foreground">{humanise(row.action)}</span>,
    },
    {
      key: "entity",
      header: "Entity",
      cell: (row) => (
        <div className="min-w-0">
          <div className="truncate">{humanise(row.entity)}</div>
          <div className="truncate text-xs text-muted-foreground">{shortId(row.entityId)}</div>
        </div>
      ),
    },
    {
      key: "ip",
      header: "IP",
      cell: (row) => <span className="text-muted-foreground">{row.ip ?? "—"}</span>,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Audit log"
        description="Append-only. Records cannot be edited or deleted — corrections are new entries."
      />

      <DataTable
        rows={page?.items ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        emptyTitle="No audit records"
        emptyDescription="Privileged actions are recorded here as they happen."
        toolbar={
          <Input
            value={entity}
            onChange={(event) => {
              setEntity(event.target.value);
              setOffset(0);
            }}
            placeholder="Filter by entity, e.g. owner"
            className="h-8 max-w-xs"
          />
        }
        pagination={{ total: page?.total ?? 0, limit: LIMIT, offset, onOffsetChange: setOffset }}
      />
    </div>
  );
}
