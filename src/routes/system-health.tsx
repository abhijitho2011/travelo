import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";

import {
  AsyncSection,
  KpiCard,
  PageHeader,
  Section,
  StatusBadge,
} from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { useSystemHealth } from "@/hooks/api/use-analytics";
import { useJobs } from "@/hooks/api/use-operations";
import { num } from "@/lib/format";

export const Route = createFileRoute("/system-health")({
  head: () => ({
    meta: [
      { title: "System health · Tavelo Super Admin" },
      { name: "description", content: "Live readiness of platform dependencies." },
    ],
  }),
  component: SystemHealthPage,
});

function SystemHealthPage() {
  const health = useSystemHealth();
  const failedJobs = useJobs({ limit: 50, state: "Failed" });

  // Terminus reports each dependency under `details`, merging `info` and `error`.
  const components = Object.entries(health.data?.details ?? health.data?.info ?? {}).map(
    ([name, value]) => ({
      name,
      status: value.status,
      detail: Object.entries(value)
        .filter(([k]) => k !== "status")
        .map(([k, v]) => `${k}: ${String(v)}`)
        .join(" · "),
    }),
  );

  const overall = health.isError ? "Down" : (health.data?.status ?? "Unknown");

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="System health"
        description="Live readiness of the API, database and queue."
        actions={
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            disabled={health.isFetching}
            onClick={() => void health.refetch()}
          >
            <RefreshCw aria-hidden className="mr-1.5 size-3.5" /> Refresh
          </Button>
        }
      />

      <div className="space-y-4 p-5 lg:p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          <KpiCard label="Overall status" value={overall === "ok" ? "Healthy" : overall} />
          <KpiCard label="Dependencies checked" value={num(components.length)} />
          <KpiCard label="Failed jobs" value={num(failedJobs.data?.items?.length ?? 0)} />
        </div>

        <Section title="Dependencies" description="Reported by the platform health check">
          <div className="px-4 py-2">
            <AsyncSection
              loading={health.isLoading}
              error={health.error}
              onRetry={() => health.refetch()}
              isEmpty={components.length === 0}
              emptyTitle="No health data"
              emptyDescription="The health endpoint returned no dependency details."
            >
              <ul className="divide-y divide-border">
                {components.map((c) => (
                  <li key={c.name} className="flex items-center justify-between gap-3 py-3">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium capitalize">{c.name}</p>
                      {c.detail && (
                        <p className="truncate text-xs text-muted-foreground">{c.detail}</p>
                      )}
                    </div>
                    <StatusBadge status={c.status === "up" ? "Healthy" : "Down"} />
                  </li>
                ))}
              </ul>
            </AsyncSection>
          </div>
        </Section>

        <Section title="Failed background jobs" description="Retry these from the jobs screen">
          <div className="px-4 py-2">
            <AsyncSection
              loading={failedJobs.isLoading}
              error={failedJobs.error}
              onRetry={() => failedJobs.refetch()}
              isEmpty={(failedJobs.data?.items?.length ?? 0) === 0}
              emptyTitle="No failed jobs"
              emptyDescription="Every queued job has completed successfully."
            >
              <ul className="divide-y divide-border">
                {failedJobs.data?.items?.map((j) => (
                  <li key={j.id} className="py-2.5">
                    <p className="truncate text-sm font-medium">{j.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {j.queue} · {j.error ?? "no error message"}
                    </p>
                  </li>
                ))}
              </ul>
            </AsyncSection>
          </div>
        </Section>
      </div>
    </>
  );
}
