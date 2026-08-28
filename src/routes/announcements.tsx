import { createFileRoute } from "@tanstack/react-router";
import { Send, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable, type Column } from "@/components/admin/data-table";
import { PageHeader, StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import type { Announcement } from "@/hooks/api/types";
import {
  useAnnouncements,
  useDeleteAnnouncement,
  usePublishAnnouncement,
} from "@/hooks/api/use-operations";
import { errorMessage } from "@/lib/api";
import { formatDateTime, humanise } from "@/lib/format";

export const Route = createFileRoute("/announcements")({
  head: () => ({
    meta: [
      { title: "Announcements · Tavelo Super Admin" },
      {
        name: "description",
        content: "Platform-wide announcements targeted at owners and hotels.",
      },
    ],
  }),
  component: AnnouncementsPage,
});

const STATUSES = ["", "DRAFT", "SCHEDULED", "PUBLISHED", "EXPIRED"];
const LIMIT = 25;

function AnnouncementsPage() {
  const [status, setStatus] = useState("");
  const [offset, setOffset] = useState(0);

  const query = useAnnouncements({ limit: LIMIT, offset, status: status || undefined });
  const publish = usePublishAnnouncement();
  const remove = useDeleteAnnouncement();
  const page = query.data;

  const columns: Column<Announcement>[] = [
    {
      key: "title",
      header: "Announcement",
      cell: (row) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">{row.title}</div>
          <div className="line-clamp-1 text-xs text-muted-foreground">{row.message}</div>
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: "priority",
      header: "Priority",
      cell: (row) => <span className="text-muted-foreground">{humanise(row.priority)}</span>,
    },
    {
      key: "scheduled",
      header: "Scheduled",
      cell: (row) => (
        <span className="text-muted-foreground">{formatDateTime(row.scheduledAt)}</span>
      ),
    },
    {
      key: "published",
      header: "Published",
      cell: (row) => (
        <span className="text-muted-foreground">{formatDateTime(row.publishedAt)}</span>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Announcements"
        description="Broadcast platform news to every owner, or to a selected audience."
      />

      <DataTable
        rows={page?.items ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        emptyTitle="No announcements"
        emptyDescription="Create an announcement to notify owners about platform changes."
        rowActions={(row) => (
          <div className="flex gap-1.5">
            {row.status !== "PUBLISHED" && (
              <Button
                size="sm"
                variant="outline"
                disabled={publish.isPending}
                onClick={() =>
                  publish.mutate(row.id, {
                    onSuccess: () => toast.success("Announcement published"),
                    onError: (error) => toast.error(errorMessage(error)),
                  })
                }
              >
                <Send className="mr-1.5 size-3.5" />
                Publish
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              disabled={remove.isPending}
              onClick={() =>
                remove.mutate(row.id, {
                  onSuccess: () => toast.success("Announcement deleted"),
                  onError: (error) => toast.error(errorMessage(error)),
                })
              }
            >
              <Trash2 className="size-3.5" />
            </Button>
          </div>
        )}
        toolbar={
          <div className="flex flex-wrap gap-1.5">
            {STATUSES.map((value) => (
              <Button
                key={value || "all"}
                size="sm"
                variant={status === value ? "default" : "outline"}
                onClick={() => {
                  setStatus(value);
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
