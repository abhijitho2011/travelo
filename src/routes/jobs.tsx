import { createFileRoute } from "@tanstack/react-router";
import { RotateCw } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable, type Column } from "@/components/admin/data-table";
import { PageHeader, StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import type { BackgroundJob } from "@/hooks/api/types";
import { useJobs, useRetryJob } from "@/hooks/api/use-operations";
import { errorMessage } from "@/lib/api";
import { formatDateTime, humanise, relativeTime } from "@/lib/format";

export const Route = createFileRoute("/jobs")({
  head: () => ({
    meta: [
      { title: "Background jobs · Tavelo Super Admin" },
      { name: "description", content: "Queue health and background job execution history." },
    ],
  }),
  component: JobsPage,
});

const STATES = ["", "waiting", "active", "completed", "failed", "delayed"];
const LIMIT = 25;

function JobsPage() {
  const [state, setState] = useState("");
  const [offset, setOffset] = useState(0);

  const query = useJobs({ limit: LIMIT, offset, state: state || undefined });
  const retry = useRetryJob();
  const page = query.data;

  const columns: Column<BackgroundJob>[] = [
    {
      key: "name",
      header: "Job",
      cell: (row) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">{row.name}</div>
          <div className="truncate text-xs text-muted-foreground">{row.queue}</div>
        </div>
      ),
    },
    { key: "state", header: "State", cell: (row) => <StatusBadge status={row.state} /> },
    {
      key: "attempts",
      header: "Attempts",
      align: "right",
      cell: (row) => <span className="text-muted-foreground">{row.attempts}</span>,
    },
    {
      key: "created",
      header: "Created",
      cell: (row) => <span className="text-muted-foreground">{relativeTime(row.createdAt)}</span>,
    },
    {
      key: "finished",
      header: "Finished",
      cell: (row) => (
        <span className="text-muted-foreground">{formatDateTime(row.finishedAt)}</span>
      ),
    },
    {
      key: "error",
      header: "Error",
      cell: (row) =>
        row.error ? (
          <span className="line-clamp-1 text-xs text-destructive">{row.error}</span>
        ) : (
          <span className="text-muted-foreground">—</span>
        ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Background jobs"
        description="Queue execution history. Failed jobs can be retried by authorised admins."
      />

      <DataTable
        rows={page?.items ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        emptyTitle="No jobs recorded"
        emptyDescription="Background jobs appear here once workers begin processing."
        rowActions={(row) =>
          row.state === "failed" ? (
            <Button
              size="sm"
              variant="outline"
              disabled={retry.isPending}
              onClick={() =>
                retry.mutate(row.id, {
                  onSuccess: () => toast.success("Job requeued"),
                  onError: (error) => toast.error(errorMessage(error)),
                })
              }
            >
              <RotateCw className="mr-1.5 size-3.5" />
              Retry
            </Button>
          ) : null
        }
        toolbar={
          <div className="flex flex-wrap gap-1.5">
            {STATES.map((value) => (
              <Button
                key={value || "all"}
                size="sm"
                variant={state === value ? "default" : "outline"}
                onClick={() => {
                  setState(value);
                  setOffset(0);
                }}
              >
                {value ? humanise(value) : "All"}
              </Button>
            ))}
          </div>
        }
        pagination={{ total: page?.total ?? 0, limit: LIMIT, offset, onOffsetChange: setOffset }}
      />
    </div>
  );
}
