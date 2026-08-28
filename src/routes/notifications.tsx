import { createFileRoute } from "@tanstack/react-router";
import { CheckCheck } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AsyncSection, PageHeader } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
} from "@/hooks/api/use-operations";
import { errorMessage } from "@/lib/api";
import { humanise, relativeTime } from "@/lib/format";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications · Tavelo Super Admin" },
      { name: "description", content: "Platform alerts and notifications for administrators." },
    ],
  }),
  component: NotificationsPage,
});

const LIMIT = 30;

function NotificationsPage() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const query = useNotifications({ limit: LIMIT, offset: 0, unread: unreadOnly || undefined });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();

  const items = query.data?.items ?? [];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        description="Alerts raised by the platform for the administration team."
        actions={
          <div className="flex gap-2">
            <Button
              size="sm"
              variant={unreadOnly ? "default" : "outline"}
              onClick={() => setUnreadOnly((v) => !v)}
            >
              Unread only
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={markAll.isPending || !query.data?.unread}
              onClick={() =>
                markAll.mutate(undefined, {
                  onSuccess: () => toast.success("All notifications marked read"),
                  onError: (error) => toast.error(errorMessage(error)),
                })
              }
            >
              <CheckCheck className="mr-1.5 size-3.5" />
              Mark all read
            </Button>
          </div>
        }
      />

      <AsyncSection
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        isEmpty={items.length === 0}
        emptyTitle="Nothing to read"
        emptyDescription="Platform notifications will appear here as events occur."
      >
        <ul className="space-y-2">
          {items.map((item) => (
            <li
              key={item.id}
              className={`panel flex items-start gap-3 p-4 ${item.readAt ? "opacity-70" : ""}`}
            >
              <span
                aria-hidden
                className={`mt-1.5 size-2 shrink-0 rounded-full ${
                  item.readAt ? "bg-muted-foreground/40" : "bg-primary"
                }`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{item.title}</span>
                  {item.category && (
                    <span className="text-xs text-muted-foreground">{humanise(item.category)}</span>
                  )}
                </div>
                {item.body && (
                  <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>
                )}
                <p className="mt-1 text-xs text-muted-foreground">{relativeTime(item.createdAt)}</p>
              </div>
              {!item.readAt && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={markRead.isPending}
                  onClick={() =>
                    markRead.mutate(item.id, {
                      onError: (error) => toast.error(errorMessage(error)),
                    })
                  }
                >
                  Mark read
                </Button>
              )}
            </li>
          ))}
        </ul>
      </AsyncSection>
    </div>
  );
}
