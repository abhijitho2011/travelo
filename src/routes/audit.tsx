import { createFileRoute } from "@tanstack/react-router";
import { Download } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable, type Column } from "@/components/admin/data-table";
import { KpiCard, MetricRow, PageHeader } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { auditLogs, roles } from "@/lib/travelo-data";

export const Route = createFileRoute("/audit")({
  head: () => ({
    meta: [
      { title: "Audit Logs · Travelo Super Admin" },
      { name: "description", content: "Immutable record of every administrative action with actor, before/after values, IP and reason." },
      { property: "og:title", content: "Audit Logs · Travelo Super Admin" },
      { property: "og:description", content: "Enterprise-grade audit trail for the Travelo platform." },
    ],
  }),
  component: AuditPage,
});

type Log = (typeof auditLogs)[number];

function AuditPage() {
  const [role, setRole] = useState("all");
  const [detail, setDetail] = useState<Log | null>(null);
  const rows = auditLogs.filter((l) => role === "all" || l.role === role);

  const columns: Column<Log>[] = [
    { key: "ts", header: "Timestamp", sortValue: (l) => l.ts, cell: (l) => <span className="tnum whitespace-nowrap">{l.ts}</span> },
    {
      key: "actor", header: "Actor", sortValue: (l) => l.actor,
      cell: (l) => (
        <span>
          <span className="block font-semibold">{l.actor}</span>
          <span className="block text-xs text-muted-foreground">{l.role}</span>
        </span>
      ),
    },
    { key: "action", header: "Action", cell: (l) => <span className="font-medium">{l.action}</span> },
    { key: "entity", header: "Entity", cell: (l) => <span className="tnum text-muted-foreground">{l.entity}</span> },
    { key: "owner", header: "Owner", cell: (l) => <span className="text-muted-foreground">{l.owner}</span> },
    { key: "hotel", header: "Property", optional: true, cell: (l) => <span className="text-muted-foreground">{l.hotel}</span> },
    { key: "ip", header: "IP address", optional: true, cell: (l) => <span className="tnum text-muted-foreground">{l.ip}</span> },
    { key: "device", header: "Device", optional: true, cell: (l) => <span className="text-muted-foreground">{l.device}</span> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Security"
        title="Audit Logs"
        description="Immutable, exportable trail of every administrative action taken in the control plane."
        breadcrumbs={[{ label: "Super Admin", to: "/" }, { label: "Audit Logs" }]}
        actions={
          <Button variant="outline" size="sm" className="h-8" onClick={() => toast.success("Audit export queued", { description: "A signed CSV will be emailed to you." })}>
            <Download aria-hidden className="mr-1.5 size-3.5" /> Export logs
          </Button>
        }
      />
      <div className="space-y-4 p-4 lg:p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Events (30d)" value="12,480" delta="+6.2%" />
          <KpiCard label="Destructive actions" value="34" trend="down" delta="all with reasons" />
          <KpiCard label="Impersonation events" value="18" hint="fully logged" />
          <KpiCard label="Retention" value="7 years" hint="write-once storage" />
        </div>

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(l) => `${l.ts}-${l.entity}`}
          searchKeys={(l) => `${l.actor} ${l.action} ${l.entity} ${l.owner} ${l.ip}`}
          searchPlaceholder="Search actor, action, entity or IP…"
          exportName="AuditLogs"
          onRowClick={(l) => setDetail(l)}
          pageSize={10}
          filters={
            <Select value={role} onValueChange={setRole}>
              <SelectTrigger className="h-8 w-[180px] text-sm" aria-label="Filter by admin role">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All roles</SelectItem>
                {roles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
              </SelectContent>
            </Select>
          }
          emptyTitle="No audit events"
          emptyDescription="Administrative actions will be recorded here automatically."
        />
      </div>

      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-full sm:max-w-md">
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle>{detail.action}</SheetTitle>
                <SheetDescription>{detail.entity} · {detail.ts}</SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <dl>
                  <MetricRow label="Actor" value={`${detail.actor} (${detail.role})`} />
                  <MetricRow label="Owner" value={detail.owner} />
                  <MetricRow label="Property" value={detail.hotel} />
                  <MetricRow label="IP address" value={detail.ip} />
                  <MetricRow label="Device" value={detail.device} />
                </dl>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="rounded-md border border-border bg-surface-muted p-3">
                    <p className="eyebrow mb-1">Before</p>
                    <p className="text-sm">{detail.before}</p>
                  </div>
                  <div className="rounded-md border border-border bg-surface-muted p-3">
                    <p className="eyebrow mb-1">After</p>
                    <p className="text-sm font-semibold">{detail.after}</p>
                  </div>
                </div>
                <div>
                  <p className="eyebrow mb-1">Reason given</p>
                  <p className="text-sm text-foreground">{detail.reason}</p>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
