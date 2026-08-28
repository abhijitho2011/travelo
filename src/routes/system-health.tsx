import { createFileRoute } from "@tanstack/react-router";

import { AsyncSection, PageHeader, StatusBadge } from "@/components/admin/primitives";
import { useSystemHealth } from "@/hooks/api/use-analytics";
import { humanise } from "@/lib/format";

export const Route = createFileRoute("/system-health")({
  head: () => ({
    meta: [
      { title: "System health · Tavelo Super Admin" },
      { name: "description", content: "Live dependency health for the Tavelo platform." },
    ],
  }),
  component: SystemHealthPage,
});

function SystemHealthPage() {
  const query = useSystemHealth();
  const report = query.data;

  // Terminus reports each dependency under `details`, merging `info` and `error`.
  const components = Object.entries(report?.details ?? report?.info ?? {});

  return (
    <div className="space-y-5">
      <PageHeader
        title="System health"
        description="Live status of platform dependencies. Refreshes automatically every 30 seconds."
        actions={report ? <StatusBadge status={report.status === "ok" ? "Healthy" : "Degraded"} /> : undefined}
      />

      <AsyncSection
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        isEmpty={components.length === 0}
        emptyTitle="No health data"
        emptyDescription="The platform did not report any dependency status."
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {components.map(([name, detail]) => (
            <div key={name} className="panel p-4">
              <div className="flex items-center justify-between gap-2">
                <span className="font-medium text-foreground">{humanise(name)}</span>
                <StatusBadge status={detail.status === "up" ? "Online" : "Degraded"} />
              </div>
              {Object.entries(detail)
                .filter(([key]) => key !== "status")
                .slice(0, 3)
                .map(([key, value]) => (
                  <p key={key} className="mt-1 text-xs text-muted-foreground">
                    {humanise(key)}: {String(value)}
                  </p>
                ))}
            </div>
          ))}
        </div>
      </AsyncSection>
    </div>
  );
}
