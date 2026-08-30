import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable, type Column } from "@/components/admin/data-table";
import { SearchBox, StatusFilter, ToolbarActions } from "@/components/admin/list-toolbar";
import { PageHeader, StatusBadge } from "@/components/admin/primitives";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Ticket } from "@/hooks/api/types";
import { useOwners } from "@/hooks/api/use-owners";
import { useCreateTicket, useTickets } from "@/hooks/api/use-support";
import { useListParams } from "@/hooks/use-list-params";
import { errorMessage } from "@/lib/api";
import { humanise, relativeTime } from "@/lib/format";

const TICKET_PRIORITIES = ["LOW", "NORMAL", "HIGH", "CRITICAL"] as const;
const NO_OWNER = "__none__";

function CreateTicketDialog() {
  const [open, setOpen] = useState(false);
  const [ownerId, setOwnerId] = useState(NO_OWNER);
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [priority, setPriority] = useState<(typeof TICKET_PRIORITIES)[number]>("NORMAL");
  const [body, setBody] = useState("");

  const owners = useOwners({ limit: 200, offset: 0 });
  const create = useCreateTicket();

  const invalid = subject.trim().length < 3;

  const reset = () => {
    setOwnerId(NO_OWNER);
    setSubject("");
    setCategory("");
    setPriority("NORMAL");
    setBody("");
  };

  const submit = async () => {
    try {
      await create.mutateAsync({
        ownerId: ownerId === NO_OWNER ? undefined : ownerId,
        subject: subject.trim(),
        category: category.trim() || undefined,
        priority,
        body: body.trim() || undefined,
      });
      toast.success("Ticket created");
      setOpen(false);
      reset();
    } catch (error) {
      toast.error("Could not create ticket", { description: errorMessage(error) });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="h-8">
          <Plus aria-hidden className="mr-1.5 size-3.5" /> New ticket
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New ticket</DialogTitle>
          <DialogDescription>
            Log a support request on an owner's behalf, or an internal follow-up.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="tk-owner">Owner (optional)</Label>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger id="tk-owner">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_OWNER}>No owner — internal</SelectItem>
                {(owners.data?.items ?? []).map((owner) => (
                  <SelectItem key={owner.id} value={owner.id}>
                    {owner.company ?? owner.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tk-subject">Subject</Label>
            <Input id="tk-subject" value={subject} onChange={(e) => setSubject(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="tk-category">Category</Label>
              <Input id="tk-category" value={category} onChange={(e) => setCategory(e.target.value)} placeholder="billing, technical…" />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="tk-priority">Priority</Label>
              <Select value={priority} onValueChange={(v) => setPriority(v as (typeof TICKET_PRIORITIES)[number])}>
                <SelectTrigger id="tk-priority">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {TICKET_PRIORITIES.map((p) => (
                    <SelectItem key={p} value={p}>
                      {humanise(p)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="tk-body">Description (optional)</Label>
            <Textarea id="tk-body" rows={3} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button disabled={invalid || create.isPending} onClick={() => void submit()}>
            {create.isPending && <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />}
            Create ticket
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
        actions={<CreateTicketDialog />}
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
