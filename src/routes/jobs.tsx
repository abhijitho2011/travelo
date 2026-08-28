import { createFileRoute } from "@tanstack/react-router";
import { RotateCw } from "lucide-react";
import { toast } from "sonner";

import { DataTable, type Column } from "@/components/admin/data-table";
import { StatusFilter, ToolbarActions } from "@/components/admin/list-toolbar";
import { PageHeader, StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import type { BackgroundJob } from "@/hooks/api/types";
import { useJobs, useRetryJob } from "@/hooks/api/use-operations";
import { useListParams } from "@/hooks/use-list-params";
import { errorMessage } from "@/lib/api";
import { formatDateTime, num, relativeTime } from "@/lib/format";

export const Route = createFileRoute("/jobs")({
  head: () => ({
    meta: [
      { title: "Background jobs · Tavelo Super Admin" },
      { name: "description", content: "Queue state for platform background workers." },
    ],
  }),
  component: JobsPage,
});

const JOB_STATES = ["Pending", "Running", "Completed", "Failed"];

function JobsPage() {
  const list = useListParams();
  const query = useJobs({ limit: list.limit, offset: list.offset, state: list.statusParam });
  const retry = useRetryJob();

  const runRetry = async (job: BackgroundJob) => {
    try {
      await retry.mutateAsync(job.id);
      toast.success("Job requeued", { description: `${job.name} will run again shortly.` });
    } catch (error) {
      toast.error("Could not retry job", { description: errorMessage(error) });
    }
  };

  const columns: Column<BackgroundJob>[] = [
    {
      key: "name",
      header: "Job",
      cell: (j) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{j.name}</p>
          <p className="truncate text-xs text-muted-foreground">{j.queue}</p>
        </div>
      ),
    },
    { key: "state", header: "State", cell: (j) => <StatusBadge status={j.state} /> },
    { key: "attempts", header: "Attempts", align: "right", cell: (j) => num(j.attempts) },
    {
      key: "error",
      header: "Error",
      cell: (j) => <span className="text-xs text-muted-foreground">{j.error ?? "—"}</span>,
    },
    { key: "scheduled", header: "Scheduled", cell: (j) => formatDateTime(j.scheduledFor) },
    { key: "finished", header: "Finished", cell: (j) => relativeTime(j.finishedAt) },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Background jobs"
        description="Queue state for reminders, metrics rollups and integration syncs."
      />
      <div className="p-5 lg:p-6">
        <DataTable
          rows={query.data?.items ?? []}
          columns={columns}
          rowKey={(j) => j.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          rowActions={(j) =>
            j.state === "Failed" ? (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs"
                disabled={retry.isPending}
                onClick={() => void runRetry(j)}
              >
                <RotateCw aria-hidden className="mr-1.5 size-3.5" /> Retry
              </Button>
            ) : null
          }
          emptyTitle="Queue is empty"
          emptyDescription="No jobs match this filter right now."
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
                options={JOB_STATES}
                label="Job state"
                allLabel="All states"
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
