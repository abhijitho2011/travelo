import { createFileRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { RefreshCw, ScrollText } from "lucide-react";
import { toast } from "sonner";

import { DataTable, type Column } from "@/components/admin/data-table";
import { StatusFilter, ToolbarActions } from "@/components/admin/list-toolbar";
import { PageHeader, StatusBadge } from "@/components/admin/primitives";
import type { IntegrationConnection } from "@/hooks/api/types";
import {
  useIntegrations,
  useSyncIntegration,
  useIntegrationLogs,
} from "@/hooks/api/use-operations";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { errorMessage } from "@/lib/api";
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
  const sync = useSyncIntegration();
  const [logsFor, setLogsFor] = useState<string | null>(null);
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
    {
      key: "actions",
      header: "",
      cell: (i) => (
        <div className="flex justify-end gap-1">
          <Button
            size="sm"
            variant="ghost"
            disabled={sync.isPending}
            onClick={() =>
              sync.mutate(i.id, {
                onSuccess: () => toast.success("Sync triggered"),
                onError: (e) => toast.error(errorMessage(e)),
              })
            }
          >
            <RefreshCw className="mr-1.5 size-3.5" /> Sync
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setLogsFor(i.id)}>
            <ScrollText className="mr-1.5 size-3.5" /> Logs
          </Button>
        </div>
      ),
    },
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
      <IntegrationLogsDialog id={logsFor} onClose={() => setLogsFor(null)} />
    </>
  );
}

function IntegrationLogsDialog({ id, onClose }: { id: string | null; onClose: () => void }) {
  const query = useIntegrationLogs(id);
  const logs = query.data ?? [];
  return (
    <Dialog open={!!id} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Sync logs</DialogTitle>
        </DialogHeader>
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : logs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No sync logs recorded.</p>
        ) : (
          <div className="max-h-96 space-y-2 overflow-y-auto">
            {logs.map((l) => (
              <div key={l.id} className="rounded-md border border-border p-2 text-sm">
                <div className="flex items-center gap-2">
                  <StatusBadge status={l.status} />
                  <span className="font-medium">{l.event}</span>
                  <span className="ml-auto text-xs text-muted-foreground">
                    {relativeTime(l.createdAt)}
                  </span>
                </div>
                {l.message && <p className="mt-1 text-muted-foreground">{l.message}</p>}
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
