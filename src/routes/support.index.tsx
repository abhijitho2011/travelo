import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";

import { DataTable, type Column } from "@/components/admin/data-table";
import { KpiCard, PageHeader, StatusBadge } from "@/components/admin/primitives";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { tickets } from "@/lib/travelo-data";

export const Route = createFileRoute("/support/")({
  head: () => ({
    meta: [
      { title: "Support Tickets · Travelo Super Admin" },
      { name: "description", content: "Triage, assign and resolve support tickets raised by hotel owners and general managers." },
      { property: "og:title", content: "Support Tickets · Travelo Super Admin" },
      { property: "og:description", content: "Support queue for the Travelo platform." },
    ],
  }),
  component: SupportPage,
});

type Ticket = (typeof tickets)[number];

const priorityClass: Record<string, string> = {
  Critical: "font-semibold text-destructive",
  High: "font-semibold text-warning",
  Normal: "text-foreground",
  Low: "text-muted-foreground",
};

function SupportPage() {
  const navigate = useNavigate();
  const [status, setStatus] = useState("open");
  const [priority, setPriority] = useState("all");

  const rows = tickets.filter((t) => {
    const statusOk =
      status === "all" ? true
        : status === "open" ? !["Resolved", "Closed"].includes(t.status)
          : t.status === status;
    return statusOk && (priority === "all" || t.priority === priority);
  });

  const columns: Column<Ticket>[] = [
    { key: "id", header: "Ticket", cell: (t) => <span className="tnum font-semibold">{t.id}</span> },
    {
      key: "subject", header: "Subject", sortValue: (t) => t.subject,
      cell: (t) => (
        <span>
          <Link to="/support/$ticketId" params={{ ticketId: t.id }} onClick={(e) => e.stopPropagation()} className="font-medium hover:text-primary hover:underline">
            {t.subject}
          </Link>
          <span className="block text-xs text-muted-foreground">{t.owner}{t.hotel !== "—" && ` · ${t.hotel}`}</span>
        </span>
      ),
    },
    { key: "category", header: "Category", cell: (t) => <span className="text-muted-foreground">{t.category}</span> },
    { key: "priority", header: "Priority", sortValue: (t) => t.priority, cell: (t) => <span className={priorityClass[t.priority]}>{t.priority}</span> },
    { key: "assigned", header: "Assigned", cell: (t) => <span className={t.assigned === "Unassigned" ? "text-warning" : ""}>{t.assigned}</span> },
    { key: "created", header: "Created", optional: true, cell: (t) => <span className="tnum text-muted-foreground">{t.created}</span> },
    { key: "updated", header: "Updated", cell: (t) => <span className="text-muted-foreground">{t.updated}</span> },
    { key: "status", header: "Status", cell: (t) => <StatusBadge status={t.status} /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Support"
        title="Support Tickets"
        description="Owner and GM requests with SLA tracking, assignment and escalation."
        breadcrumbs={[{ label: "Super Admin", to: "/" }, { label: "Support Tickets" }]}
      />
      <div className="space-y-4 p-4 lg:p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Open tickets" value="5" trend="down" delta="2 unassigned" />
          <KpiCard label="Critical" value="1" trend="down" delta="SLA 2h" />
          <KpiCard label="First response" value="34 min" delta="-11 min" />
          <KpiCard label="Resolved (7d)" value="46" delta="+8" />
        </div>

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(t) => t.id}
          searchKeys={(t) => `${t.id} ${t.subject} ${t.owner} ${t.hotel} ${t.assigned}`}
          searchPlaceholder="Search ticket, owner or subject…"
          exportName="SupportTickets"
          onRowClick={(t) => navigate({ to: "/support/$ticketId", params: { ticketId: t.id } })}
          filters={
            <>
              <Select value={status} onValueChange={setStatus}>
                <SelectTrigger className="h-8 w-[170px] text-sm" aria-label="Filter by ticket status">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="open">Open queue</SelectItem>
                  <SelectItem value="all">All tickets</SelectItem>
                  <SelectItem value="Open">Open</SelectItem>
                  <SelectItem value="In Progress">In progress</SelectItem>
                  <SelectItem value="Waiting for Owner">Waiting for owner</SelectItem>
                  <SelectItem value="Resolved">Resolved</SelectItem>
                  <SelectItem value="Closed">Closed</SelectItem>
                </SelectContent>
              </Select>
              <Select value={priority} onValueChange={setPriority}>
                <SelectTrigger className="h-8 w-[150px] text-sm" aria-label="Filter by priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All priorities</SelectItem>
                  <SelectItem value="Critical">Critical</SelectItem>
                  <SelectItem value="High">High</SelectItem>
                  <SelectItem value="Normal">Normal</SelectItem>
                  <SelectItem value="Low">Low</SelectItem>
                </SelectContent>
              </Select>
            </>
          }
          emptyTitle="Queue is clear"
          emptyDescription="No tickets match this filter — nice work."
        />
      </div>
    </>
  );
}
