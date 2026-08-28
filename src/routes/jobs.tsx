import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { DataTable, type Column } from "@/components/admin/data-table";
import { KpiCard, PageHeader, StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { jobs } from "@/lib/travelo-data";

export const Route = createFileRoute("/jobs")({
  head: () => ({
    meta: [
      { title: "Background Jobs · Travelo Super Admin" },
      { name: "description", content: "Queue depth, failures and retries for channel syncs, billing runs, notifications and analytics rollups." },
      { property: "og:title", content: "Background Jobs · Travelo Super Admin" },
      { property: "og:description", content: "Background job and queue monitoring." },
    ],
  }),
  component: JobsPage,
});

type Job = (typeof jobs)[number];

function JobsPage() {
  const columns: Column<Job>[] = [
    { key: "name", header: "Job", sortValue: (j) => j.name, cell: (j) => <span className="font-semibold">{j.name}</span> },
    { key: "queue", header: "Queue", cell: (j) => <span className="tnum text-muted-foreground">{j.queue}</span> },
    { key: "count", header: "Items", align: "right", sortValue: (j) => j.count, cell: (j) => <span className="tnum">{j.count.toLocaleString("en-IN")}</span> },
    { key: "runtime", header: "Runtime", cell: (j) => <span className="tnum text-muted-foreground">{j.runtime}</span> },
    { key: "attempts", header: "Attempts", align: "right", cell: (j) => <span className="tnum">{j.attempts}</span> },
    { key: "state", header: "State", cell: (j) => <StatusBadge status={j.state} /> },
    {
      key: "actions", header: "",
      cell: (j) => (
        <span className="flex justify-end gap-1.5">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => toast.success(`${j.name} re-queued`)}>Retry</Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toast.info(`${j.name}`, { description: `Queue ${j.queue} · ${j.count} items · ${j.runtime}` })}>Details</Button>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Background Jobs"
        description="Asynchronous work powering syncs, billing, notifications and reporting."
        breadcrumbs={[{ label: "Super Admin", to: "/" }, { label: "Background Jobs" }]}
      />
      <div className="space-y-4 p-4 lg:p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Processed (24h)" value="184,220" delta="+4.1%" />
          <KpiCard label="In queue" value="2,140" trend="down" delta="notifications lag" />
          <KpiCard label="Failed (24h)" value="8" trend="down" delta="3 retries each" />
          <KpiCard label="Avg runtime" value="2.4 s" delta="-0.3 s" />
        </div>
        <DataTable
          rows={jobs}
          columns={columns}
          rowKey={(j) => j.name}
          searchKeys={(j) => `${j.name} ${j.queue} ${j.state}`}
          searchPlaceholder="Search job or queue…"
          exportName="BackgroundJobs"
          pageSize={10}
          emptyTitle="No jobs running"
          emptyDescription="Scheduled work will appear here as it is queued."
        />
      </div>
    </>
  );
}
