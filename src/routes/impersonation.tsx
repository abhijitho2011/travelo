import { createFileRoute } from "@tanstack/react-router";
import { PowerOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable, type Column } from "@/components/admin/data-table";
import { PageHeader, StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import type { ImpersonationSession } from "@/hooks/api/types";
import {
  useImpersonationHistory,
  useTerminateImpersonation,
} from "@/hooks/api/use-operations";
import { errorMessage } from "@/lib/api";
import { formatDateTime, humanise, shortId } from "@/lib/format";

export const Route = createFileRoute("/impersonation")({
  head: () => ({
    meta: [
      { title: "Impersonation · Tavelo Super Admin" },
      {
        name: "description",
        content: "Audited support impersonation sessions across owner accounts.",
      },
    ],
  }),
  component: ImpersonationPage,
});

const LIMIT = 25;

function ImpersonationPage() {
  const [offset, setOffset] = useState(0);
  const query = useImpersonationHistory({ limit: LIMIT, offset });
  const terminate = useTerminateImpersonation();
  const page = query.data;

  const columns: Column<ImpersonationSession>[] = [
    {
      key: "target",
      header: "Target",
      cell: (row) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">
            {humanise(row.targetUserType)}
          </div>
          <div className="truncate text-xs text-muted-foreground">
            {shortId(row.targetUserId)}
          </div>
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: "reason",
      header: "Reason",
      cell: (row) => <span className="line-clamp-1 text-muted-foreground">{row.reason}</span>,
    },
    {
      key: "started",
      header: "Started",
      cell: (row) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDateTime(row.startedAt)}
        </span>
      ),
    },
    {
      key: "ended",
      header: "Ended",
      cell: (row) => (
        <span className="whitespace-nowrap text-muted-foreground">
          {formatDateTime(row.endedAt)}
        </span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Impersonation"
        description="Every session is recorded. Actions taken while impersonating retain the acting admin in the audit trail."
      />

      <DataTable
        rows={page?.items ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        emptyTitle="No impersonation sessions"
        emptyDescription="Support impersonation sessions appear here once started."
        rowActions={(row) =>
          row.status === "ACTIVE" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={terminate.isPending}
              onClick={() =>
                terminate.mutate(row.id, {
                  onSuccess: () => toast.success("Session terminated"),
                  onError: (error) => toast.error(errorMessage(error)),
                })
              }
            >
              <PowerOff className="mr-1.5 size-3.5" />
              Terminate
            </Button>
          ) : null
        }
        pagination={{ total: page?.total ?? 0, limit: LIMIT, offset, onOffsetChange: setOffset }}
      />
    </div>
  );
}
