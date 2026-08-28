import { createFileRoute, useNavigate } from "@tanstack/react-router";

import { DataTable, type Column } from "@/components/admin/data-table";
import { SearchBox, StatusFilter, ToolbarActions } from "@/components/admin/list-toolbar";
import { PageHeader, StatusBadge } from "@/components/admin/primitives";
import type { Ticket } from "@/hooks/api/types";
import { useTickets } from "@/hooks/api/use-support";
import { useListParams } from "@/hooks/use-list-params";
import { humanise, relativeTime } from "@/lib/format";

export const Route = createFileRoute("/support/")({
  head: () => ({
    meta: [
      { title: "Support tickets · Tavelo Super Admin" },
      { name: "description", content: "Owner support requests and their resolution state." },
    ],
  }),
  component: SupportPage,
});

const TICKET_STATUSES = ["OPEN", "IN_PROGRESS", "WAITING_FOR_OWNER", "RESOLVED", "CLOSED"];

function SupportPage() {
  const navigate = useNavigate();
  const list = useListParams();
  const query = useTickets({
    limit: list.limit,
    offset: list.offset,
    q: list.q,
    status: list.statusParam,
  });

  const columns: Column<Ticket>[] = [
    {
      key: "subject",
      header: "Subject",
      cell: (t) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{t.subject}</p>
          <p className="truncate text-xs text-muted-foreground">
            {t.owner ?? "Unassigned owner"}
            {t.hotel ? ` · ${t.hotel}` : ""}
          </p>
        </div>
      ),
    },
    { key: "priority", header: "Priority", cell: (t) => <StatusBadge status={t.priority} /> },
    { key: "status", header: "Status", cell: (t) => <StatusBadge status={t.status} /> },
    { key: "category", header: "Category", cell: (t) => humanise(t.category) },
    { key: "assigned", header: "Assigned", cell: (t) => t.assigned },
    { key: "created", header: "Opened", cell: (t) => relativeTime(t.createdAt) },
    {
      key: "response",
      header: "First response",
      cell: (t) =>
        t.firstResponseAt ? (
          relativeTime(t.firstResponseAt)
        ) : (
          <span className="text-xs text-warning">Awaiting reply</span>
        ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Support"
        title="Support tickets"
        description="Owner requests, their priority and resolution state."
      />
      <div className="p-5 lg:p-6">
        <DataTable
          rows={query.data?.items ?? []}
          columns={columns}
          rowKey={(t) => t.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          onRowClick={(t) => navigate({ to: "/support/$ticketId", params: { ticketId: t.id } })}
          emptyTitle="No tickets match this view"
          emptyDescription="Adjust the search or status filter — or enjoy inbox zero."
          pagination={{
            total: query.data?.total ?? 0,
            limit: list.limit,
            offset: list.offset,
            onOffsetChange: list.setOffset,
          }}
          toolbar={
            <>
              <SearchBox
                value={list.search}
                onChange={list.setSearch}
                placeholder="Search ticket subjects…"
              />
              <StatusFilter
                value={list.status}
                onChange={list.setStatus}
                options={TICKET_STATUSES}
              />
              <ToolbarActions>
                <span className="tnum text-xs text-muted-foreground">
                  {query.data?.total ?? 0} total
                </span>
              </ToolbarActions>
            </>
          }
        />
      </div>
    </>
  );
}
