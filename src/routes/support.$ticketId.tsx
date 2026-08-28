import { createFileRoute, Link, notFound } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { EmptyState, MetricRow, PageHeader, Section, StatusBadge, Timeline } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { tickets } from "@/lib/travelo-data";

export const Route = createFileRoute("/support/$ticketId")({
  loader: ({ params }) => {
    const ticket = tickets.find((t) => t.id === params.ticketId);
    if (!ticket) throw notFound();
    return { ticket };
  },
  head: ({ loaderData }) => {
    const t = loaderData?.ticket;
    const title = t ? `${t.id} · ${t.subject}` : "Support ticket";
    return {
      meta: [
        { title: `${title} · Travelo Support` },
        { name: "description", content: t ? `${t.category} ticket from ${t.owner}, priority ${t.priority}.` : "Support ticket detail." },
        { property: "og:title", content: title },
        { property: "og:description", content: "Travelo support ticket detail and conversation." },
      ],
    };
  },
  errorComponent: () => (
    <div className="p-6"><Section><EmptyState title="Ticket failed to load" description="Retry from the support queue." /></Section></div>
  ),
  notFoundComponent: () => (
    <div className="p-6">
      <Section>
        <EmptyState
          title="Ticket not found"
          description="This ticket ID does not exist or was merged."
          action={<Button asChild size="sm"><Link to="/support">Back to queue</Link></Button>}
        />
      </Section>
    </div>
  ),
  component: TicketDetail,
});

function TicketDetail() {
  const { ticket } = Route.useLoaderData();
  const [reply, setReply] = useState("");

  return (
    <>
      <PageHeader
        eyebrow={`Support · ${ticket.category}`}
        title={ticket.subject}
        description={`${ticket.id} · raised by ${ticket.owner}${ticket.hotel !== "—" ? ` · ${ticket.hotel}` : ""}`}
        breadcrumbs={[{ label: "Support Tickets", to: "/support" }, { label: ticket.id }]}
        actions={
          <>
            <Button variant="outline" size="sm" className="h-8" onClick={() => toast.success("Ticket escalated to engineering")}>Escalate</Button>
            <Button size="sm" className="h-8" onClick={() => toast.success(`${ticket.id} marked resolved`)}>Resolve</Button>
          </>
        }
      />

      <div className="grid gap-4 p-4 lg:grid-cols-3 lg:p-6">
        <div className="space-y-4 lg:col-span-2">
          <Section title="Conversation">
            <div className="divide-y divide-border">
              {[
                { who: ticket.owner, role: "Owner", time: ticket.created, text: ticket.subject + ". This started after the last update and is affecting live inventory. Please prioritise." },
                { who: ticket.assigned === "Unassigned" ? "Travelo Support" : ticket.assigned, role: "Travelo", time: "1 hour later", text: "Thanks for flagging. We've reproduced the issue and are working with the provider. We'll update you within two hours." },
                { who: ticket.owner, role: "Owner", time: ticket.updated, text: "Understood — the GM is monitoring rates manually until this is fixed." },
              ].map((m, i) => (
                <article key={i} className="px-4 py-3">
                  <header className="mb-1 flex flex-wrap items-center gap-2 text-xs">
                    <span className="font-semibold text-foreground">{m.who}</span>
                    <span className="rounded border border-border bg-surface-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{m.role}</span>
                    <span className="text-muted-foreground">{m.time}</span>
                  </header>
                  <p className="text-sm text-foreground">{m.text}</p>
                </article>
              ))}
            </div>
            <div className="space-y-2 border-t border-border p-4">
              <Textarea
                aria-label="Reply to ticket"
                rows={4}
                placeholder="Write a reply to the owner…"
                value={reply}
                onChange={(e) => setReply(e.target.value)}
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  className="h-8"
                  disabled={reply.trim().length < 3}
                  onClick={() => { setReply(""); toast.success("Reply sent", { description: "The owner was notified by email and in-app." }); }}
                >
                  Send reply
                </Button>
                <Button variant="outline" size="sm" className="h-8" onClick={() => toast.success("Internal note saved")}>Save internal note</Button>
              </div>
            </div>
          </Section>

          <Section title="Activity">
            <div className="px-4 py-2">
              <Timeline
                items={[
                  { time: ticket.updated, text: `Status changed to ${ticket.status}`, actor: ticket.assigned, tone: "info" },
                  { time: "3 hours ago", text: "Priority raised to " + ticket.priority, actor: "Farah Sheikh", tone: "warning" },
                  { time: "5 hours ago", text: `Assigned to ${ticket.assigned}`, actor: "Triage bot", tone: "neutral" },
                  { time: ticket.created, text: "Ticket created by owner", actor: ticket.owner, tone: "success" },
                ]}
              />
            </div>
          </Section>
        </div>

        <div className="space-y-4">
          <Section title="Ticket details">
            <div className="p-4">
              <dl>
                <MetricRow label="Status" value={<StatusBadge status={ticket.status} />} />
                <MetricRow label="Priority" value={ticket.priority} />
                <MetricRow label="Category" value={ticket.category} />
                <MetricRow label="Owner" value={<Link to="/owners/$ownerId" params={{ ownerId: ticket.ownerId }} className="text-primary hover:underline">{ticket.owner}</Link>} />
                <MetricRow label="Property" value={ticket.hotel} />
                <MetricRow label="Created" value={ticket.created} />
                <MetricRow label="Last update" value={ticket.updated} />
                <MetricRow label="SLA" value={ticket.priority === "Critical" ? "2h response · 8h fix" : "8h response · 3d fix"} />
              </dl>
            </div>
          </Section>

          <Section title="Assignment">
            <div className="space-y-2 p-4">
              <Select defaultValue={ticket.assigned} onValueChange={(v) => toast.success(`Assigned to ${v}`)}>
                <SelectTrigger className="h-8 text-sm" aria-label="Assign ticket">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Unassigned", "Nishant K.", "Farah S.", "Devang P.", "Ritu B."].map((a) => (
                    <SelectItem key={a} value={a}>{a}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select defaultValue={ticket.priority} onValueChange={(v) => toast.success(`Priority set to ${v}`)}>
                <SelectTrigger className="h-8 text-sm" aria-label="Change priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["Critical", "High", "Normal", "Low"].map((p) => (
                    <SelectItem key={p} value={p}>{p}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button variant="outline" size="sm" className="h-8 w-full" asChild>
                <Link to="/impersonation">Open impersonation console</Link>
              </Button>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
