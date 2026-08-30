import { createFileRoute } from "@tanstack/react-router";
import { CheckCheck, Pencil, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AsyncSection, PageHeader, StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useMarkAllNotificationsRead,
  useMarkNotificationRead,
  useNotifications,
  useNotificationDeliveries,
  useNotificationTemplates,
  useUpsertNotificationTemplate,
} from "@/hooks/api/use-operations";
import type { NotificationTemplate } from "@/hooks/api/types";
import { errorMessage } from "@/lib/api";
import { humanise, relativeTime } from "@/lib/format";

export const Route = createFileRoute("/notifications")({
  head: () => ({
    meta: [
      { title: "Notifications · Tavelo Super Admin" },
      { name: "description", content: "Platform alerts, delivery trail and templates." },
    ],
  }),
  component: NotificationsPage,
});

type View = "inbox" | "deliveries" | "templates";

function NotificationsPage() {
  const [view, setView] = useState<View>("inbox");

  return (
    <div className="space-y-5">
      <PageHeader
        title="Notifications"
        description="The admin inbox, the delivery trail across every channel, and the message templates."
      />
      <div className="flex gap-2">
        {(["inbox", "deliveries", "templates"] as View[]).map((v) => (
          <Button
            key={v}
            size="sm"
            variant={view === v ? "default" : "outline"}
            onClick={() => setView(v)}
          >
            {humanise(v)}
          </Button>
        ))}
      </div>
      {view === "inbox" && <InboxView />}
      {view === "deliveries" && <DeliveriesView />}
      {view === "templates" && <TemplatesView />}
    </div>
  );
}

function InboxView() {
  const [unreadOnly, setUnreadOnly] = useState(false);
  const query = useNotifications({ limit: 30, offset: 0, unread: unreadOnly || undefined });
  const markRead = useMarkNotificationRead();
  const markAll = useMarkAllNotificationsRead();
  const items = query.data?.items ?? [];

  return (
    <div className="space-y-3">
      <div className="flex justify-end gap-2">
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
            <li key={item.id} className={`panel flex items-start gap-3 p-4 ${item.readAt ? "opacity-70" : ""}`}>
              <span
                aria-hidden
                className={`mt-1.5 size-2 shrink-0 rounded-full ${item.readAt ? "bg-muted-foreground/40" : "bg-primary"}`}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium text-foreground">{item.title}</span>
                  {item.category && (
                    <span className="text-xs text-muted-foreground">{humanise(item.category)}</span>
                  )}
                </div>
                {item.body && <p className="mt-1 text-sm text-muted-foreground">{item.body}</p>}
                <p className="mt-1 text-xs text-muted-foreground">{relativeTime(item.createdAt)}</p>
              </div>
              {!item.readAt && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={markRead.isPending}
                  onClick={() => markRead.mutate(item.id, { onError: (e) => toast.error(errorMessage(e)) })}
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

function DeliveriesView() {
  const [status, setStatus] = useState<string>("");
  const query = useNotificationDeliveries({ status: status || undefined, limit: 50 });
  const items = query.data?.items ?? [];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap justify-end gap-2">
        {["", "SENT", "FAILED", "SKIPPED", "PENDING"].map((s) => (
          <Button
            key={s || "all"}
            size="sm"
            variant={status === s ? "default" : "outline"}
            onClick={() => setStatus(s)}
          >
            {s ? humanise(s) : "All"}
          </Button>
        ))}
      </div>
      <AsyncSection
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        isEmpty={items.length === 0}
        emptyTitle="No deliveries"
        emptyDescription="Every send attempt across email, SMS and in-app will be listed here."
      >
        <div className="panel divide-y divide-border">
          {items.map((d) => (
            <div key={d.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <StatusBadge status={d.status} />
              <span className="font-medium text-foreground">{d.notificationKey ?? "—"}</span>
              <span className="text-xs text-muted-foreground">{d.channel}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {d.recipient ?? d.subject ?? ""}
              </span>
              {d.attempts > 1 && <span className="text-xs text-warning">{d.attempts} attempts</span>}
              <span className="text-xs text-muted-foreground">{relativeTime(d.createdAt)}</span>
            </div>
          ))}
        </div>
      </AsyncSection>
    </div>
  );
}

function TemplatesView() {
  const query = useNotificationTemplates();
  const templates = query.data ?? [];

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <TemplateDialog />
      </div>
      <AsyncSection
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        isEmpty={templates.length === 0}
        emptyTitle="No templates"
        emptyDescription="Message templates for each key and channel appear here."
      >
        <div className="panel divide-y divide-border">
          {templates.map((t) => (
            <div key={t.id} className="flex flex-wrap items-center gap-3 p-3 text-sm">
              <StatusBadge status={t.status} />
              <span className="font-medium text-foreground">{t.templateKey}</span>
              <span className="text-xs text-muted-foreground">{t.channel}</span>
              <span className="min-w-0 flex-1 truncate text-muted-foreground">
                {t.subject ?? t.name}
              </span>
              <TemplateDialog existing={t} />
            </div>
          ))}
        </div>
      </AsyncSection>
    </div>
  );
}

function TemplateDialog({ existing }: { existing?: NotificationTemplate }) {
  const [open, setOpen] = useState(false);
  const [templateKey, setKey] = useState(existing?.templateKey ?? "");
  const [name, setName] = useState(existing?.name ?? "");
  const [channel, setChannel] = useState(existing?.channel ?? "EMAIL");
  const [subject, setSubject] = useState(existing?.subject ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const upsert = useUpsertNotificationTemplate();

  const invalid = templateKey.trim().length < 2 || name.trim().length < 2 || body.trim().length < 2;

  const submit = async () => {
    try {
      await upsert.mutateAsync({
        templateKey: templateKey.trim(),
        name: name.trim(),
        channel,
        subject: subject.trim() || undefined,
        body,
        status: "Active",
      });
      toast.success(existing ? "Template updated" : "Template created");
      setOpen(false);
    } catch (error) {
      toast.error("Could not save template", { description: errorMessage(error) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {existing ? (
          <Button size="sm" variant="ghost">
            <Pencil className="mr-1.5 size-3.5" /> Edit
          </Button>
        ) : (
          <Button size="sm" className="h-8">
            <Plus className="mr-1.5 size-3.5" /> New template
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{existing ? "Edit template" : "Create template"}</DialogTitle>
          <DialogDescription>
            Placeholders like {"{{ownerName}}"} are filled at send time.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tpl-key">Key</Label>
              <Input
                id="tpl-key"
                value={templateKey}
                disabled={!!existing}
                onChange={(e) => setKey(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tpl-channel">Channel</Label>
              <select
                id="tpl-channel"
                className="border-input bg-background h-9 w-full rounded-md border px-3 text-sm"
                value={channel}
                disabled={!!existing}
                onChange={(e) => setChannel(e.target.value)}
              >
                {["EMAIL", "SMS", "IN_APP"].map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-name">Name</Label>
            <Input id="tpl-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-subject">Subject (email only)</Label>
            <Input id="tpl-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tpl-body">Body</Label>
            <Textarea id="tpl-body" rows={5} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={invalid || upsert.isPending} onClick={() => void submit()}>
            {existing ? "Save" : "Create"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
