import { createFileRoute } from "@tanstack/react-router";
import { RefreshCw } from "lucide-react";
import { toast } from "sonner";

import { DataTable, type Column } from "@/components/admin/data-table";
import { KpiCard, PageHeader, Section, StatusBadge, Timeline } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { integrations } from "@/lib/travelo-data";

export const Route = createFileRoute("/integrations")({
  head: () => ({
    meta: [
      { title: "Integrations · Travelo Super Admin" },
      { name: "description", content: "Health of channel managers, payment gateways, notification providers and key-card vendors." },
      { property: "og:title", content: "Integrations · Travelo Super Admin" },
      { property: "og:description", content: "Third-party integration monitoring for the Travelo platform." },
    ],
  }),
  component: IntegrationsPage,
});

type Integration = (typeof integrations)[number];

function IntegrationsPage() {
  const columns: Column<Integration>[] = [
    { key: "name", header: "Integration", sortValue: (i) => i.name, cell: (i) => <span className="font-semibold">{i.name}</span> },
    { key: "scope", header: "Scope", cell: (i) => <span className="text-muted-foreground">{i.scope}</span> },
    { key: "detail", header: "Detail", cell: (i) => <span className="text-muted-foreground">{i.detail}</span> },
    { key: "sync", header: "Last sync", cell: (i) => <span className="tnum">{i.lastSync}</span> },
    { key: "errors", header: "Errors (24h)", align: "right", sortValue: (i) => i.errors, cell: (i) => <span className={i.errors > 0 ? "tnum font-semibold text-destructive" : "tnum text-muted-foreground"}>{i.errors}</span> },
    { key: "status", header: "Status", cell: (i) => <StatusBadge status={i.status} /> },
    {
      key: "actions", header: "",
      cell: (i) => (
        <span className="flex justify-end gap-1.5">
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={() => toast.success(`Retry queued for ${i.name}`)}>Retry</Button>
          <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => toast.info(`Logs for ${i.name}`, { description: `${i.errors} errors in the last 24 hours.` })}>Logs</Button>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Integrations"
        description="Channel managers, payment gateways, messaging providers and hardware vendors."
        breadcrumbs={[{ label: "Super Admin", to: "/" }, { label: "Integrations" }]}
        actions={
          <Button variant="outline" size="sm" className="h-8" onClick={() => toast.success("Full health check started")}>
            <RefreshCw aria-hidden className="mr-1.5 size-3.5" /> Run health check
          </Button>
        }
      />
      <div className="space-y-4 p-4 lg:p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Healthy" value="4" delta="of 7 integrations" />
          <KpiCard label="Degraded" value="1" trend="down" delta="Channex rate push" />
          <KpiCard label="Failing" value="2" trend="down" delta="WhatsApp, Onity" />
          <KpiCard label="Errors (24h)" value="49" trend="down" delta="+12 vs yesterday" />
        </div>

        <DataTable
          rows={integrations}
          columns={columns}
          rowKey={(i) => i.name}
          searchKeys={(i) => `${i.name} ${i.scope} ${i.detail}`}
          searchPlaceholder="Search integration…"
          exportName="Integrations"
          pageSize={10}
          emptyTitle="No integrations configured"
          emptyDescription="Connect a channel manager or payment gateway to begin."
        />

        <Section title="Recent integration events">
          <div className="px-4 py-2">
            <Timeline
              items={[
                { time: "4 min ago", text: "Channex rate push failed for Marine Bay Creekside (HTTP 429)", actor: "Channex", tone: "warning" },
                { time: "51 min ago", text: "WhatsApp template 'payment_failed' rejected by provider", actor: "Meta", tone: "danger" },
                { time: "2 hours ago", text: "Razorpay webhook backlog cleared (312 events)", actor: "System", tone: "success" },
                { time: "6 hours ago", text: "Onity key-card gateway unreachable — property notified", actor: "System", tone: "danger" },
                { time: "yesterday", text: "Stripe UAE payouts reconciled", actor: "Finance job", tone: "success" },
              ]}
            />
          </div>
        </Section>
      </div>
    </>
  );
}
