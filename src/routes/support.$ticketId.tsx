import { createFileRoute } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AsyncSection, DetailGrid, PageHeader, StatusBadge } from "@/components/admin/primitives";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useAdminUsers } from "@/hooks/api/use-access";
import {
  useAssignTicket,
  useReplyToTicket,
  useTicket,
  useTicketStatusAction,
} from "@/hooks/api/use-support";
import { errorMessage } from "@/lib/api";
import { formatDateTime, humanise } from "@/lib/format";

export const Route = createFileRoute("/support/$ticketId")({
  head: () => ({
    meta: [
      { title: "Ticket · Tavelo Super Admin" },
      { name: "description", content: "Support ticket conversation and resolution actions." },
    ],
  }),
  component: TicketPage,
});

function TicketPage() {
  const { ticketId } = Route.useParams();
  const query = useTicket(ticketId);
  const reply = useReplyToTicket(ticketId);
  const statusAction = useTicketStatusAction(ticketId);

  const [body, setBody] = useState("");
  const [internal, setInternal] = useState(false);

  const ticket = query.data;

  const send = () => {
    const text = body.trim();
    if (!text) return;
    reply.mutate(
      { body: text, isInternalNote: internal },
      {
        onSuccess: () => {
          setBody("");
          toast.success(internal ? "Internal note added" : "Reply sent");
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Support"
        title={ticket?.subject ?? "Ticket"}
        description={ticket ? `Opened ${formatDateTime(ticket.createdAt)}` : undefined}
        breadcrumbs={[{ label: "Support", to: "/support" }, { label: "Ticket" }]}
        actions={
          ticket && ticket.status !== "CLOSED" ? (
            <div className="flex gap-2">
              <AssignTicketDialog ticketId={ticketId} assigned={ticket.assigned} />
              {ticket.status !== "RESOLVED" && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={statusAction.isPending}
                  onClick={() =>
                    statusAction.mutate("resolve", {
                      onSuccess: () => toast.success("Ticket resolved"),
                      onError: (error) => toast.error(errorMessage(error)),
                    })
                  }
                >
                  Resolve
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={statusAction.isPending}
                onClick={() =>
                  statusAction.mutate("close", {
                    onSuccess: () => toast.success("Ticket closed"),
                    onError: (error) => toast.error(errorMessage(error)),
                  })
                }
              >
                Close
              </Button>
            </div>
          ) : undefined
        }
      />

      <AsyncSection
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        isEmpty={!ticket}
        emptyTitle="Ticket not found"
        emptyDescription="This ticket may have been removed."
      >
        {ticket && (
          <div className="space-y-5">
            <DetailGrid
              items={[
                { label: "Status", value: <StatusBadge status={ticket.status} /> },
                { label: "Priority", value: <StatusBadge status={humanise(ticket.priority)} /> },
                { label: "Owner", value: ticket.owner ?? "—" },
                { label: "Hotel", value: ticket.hotel ?? "—" },
                { label: "Assigned to", value: ticket.assigned || "Unassigned" },
                { label: "Category", value: humanise(ticket.category) },
              ]}
            />

            <section className="panel divide-y divide-border">
              {ticket.messages.length === 0 ? (
                <p className="p-4 text-sm text-muted-foreground">No messages yet.</p>
              ) : (
                ticket.messages.map((message) => (
                  <article key={message.id} className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-foreground">
                        {humanise(message.authorType)}
                      </span>
                      {message.isInternalNote && (
                        <StatusBadge status="Internal note" tone="warning" />
                      )}
                      <span className="text-xs text-muted-foreground">
                        {formatDateTime(message.createdAt)}
                      </span>
                    </div>
                    <p className="mt-1.5 whitespace-pre-wrap text-sm text-muted-foreground">
                      {message.body}
                    </p>
                  </article>
                ))
              )}
            </section>

            <section className="panel space-y-3 p-4">
              <Textarea
                value={body}
                onChange={(event) => setBody(event.target.value)}
                placeholder="Write a reply to the owner…"
                rows={4}
              />
              <div className="flex flex-wrap items-center justify-between gap-2">
                <label className="flex items-center gap-2 text-sm text-muted-foreground">
                  <input
                    type="checkbox"
                    checked={internal}
                    onChange={(event) => setInternal(event.target.checked)}
                    className="size-4 rounded border-border"
                  />
                  Internal note (not visible to the owner)
                </label>
                <Button onClick={send} disabled={reply.isPending || !body.trim()}>
                  {reply.isPending && <Loader2 className="mr-1.5 size-3.5 animate-spin" />}
                  {internal ? "Add note" : "Send reply"}
                </Button>
              </div>
            </section>
          </div>
        )}
      </AsyncSection>
    </div>
  );
}

function AssignTicketDialog({ ticketId, assigned }: { ticketId: string; assigned: string }) {
  const [open, setOpen] = useState(false);
  const [adminId, setAdminId] = useState("");
  const admins = useAdminUsers({ limit: 100 });
  const assign = useAssignTicket(ticketId);

  const submit = () => {
    if (!adminId) return;
    assign.mutate(adminId, {
      onSuccess: () => {
        toast.success("Ticket assigned");
        setOpen(false);
        setAdminId("");
      },
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline">
          {assigned ? "Reassign" : "Assign"}
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Assign ticket</DialogTitle>
          <DialogDescription>
            {assigned ? `Currently assigned to ${assigned}.` : "This ticket is unassigned."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-1.5">
          <Label htmlFor="assignee">Assignee</Label>
          <select
            id="assignee"
            value={adminId}
            onChange={(event) => setAdminId(event.target.value)}
            className="h-9 w-full rounded-md border border-border bg-surface px-2 text-sm"
          >
            <option value="">Select an admin…</option>
            {(admins.data?.items ?? [])
              .filter((a) => a.status !== "Suspended")
              .map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name} · {a.email}
                </option>
              ))}
          </select>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={assign.isPending}>
            Cancel
          </Button>
          <Button disabled={!adminId || assign.isPending} onClick={submit}>
            {assign.isPending && <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />}
            Assign
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
