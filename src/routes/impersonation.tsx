import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { DataTable, type Column } from "@/components/admin/data-table";
import { KpiCard, PageHeader, Section, StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { impersonationSessions, owners } from "@/lib/travelo-data";

export const Route = createFileRoute("/impersonation")({
  head: () => ({
    meta: [
      { title: "Impersonation Console · Travelo Super Admin" },
      { name: "description", content: "Start time-boxed, fully audited read-only or read-write impersonation sessions to support hotel owners." },
      { property: "og:title", content: "Impersonation Console · Travelo Super Admin" },
      { property: "og:description", content: "Controlled owner impersonation with full audit trail." },
    ],
  }),
  component: ImpersonationPage,
});

type Session = (typeof impersonationSessions)[number];

function ImpersonationPage() {
  const [owner, setOwner] = useState(owners[0]!.id);
  const [mode, setMode] = useState("read-only");
  const [duration, setDuration] = useState("30");
  const [reason, setReason] = useState("");
  const selected = owners.find((o) => o.id === owner)!;

  const columns: Column<Session>[] = [
    { key: "admin", header: "Administrator", sortValue: (s) => s.admin, cell: (s) => <span className="font-semibold">{s.admin}</span> },
    { key: "target", header: "Impersonated", cell: (s) => s.target },
    { key: "owner", header: "Owner account", cell: (s) => <span className="text-muted-foreground">{s.owner}</span> },
    { key: "start", header: "Started", sortValue: (s) => s.start, cell: (s) => <span className="tnum">{s.start}</span> },
    { key: "duration", header: "Duration", align: "right", cell: (s) => <span className="tnum">{s.duration}</span> },
    { key: "actions", header: "Actions taken", align: "right", sortValue: (s) => s.actions, cell: (s) => <span className="tnum">{s.actions}</span> },
    { key: "status", header: "State", cell: () => <StatusBadge status="Closed" /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Security"
        title="Impersonation Console"
        description="Support owners from inside their workspace — time-boxed, consent-based and fully recorded."
        breadcrumbs={[{ label: "Super Admin", to: "/" }, { label: "Impersonation" }]}
      />
      <div className="space-y-4 p-4 lg:p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Sessions (30d)" value="18" hint="all audited" />
          <KpiCard label="Average duration" value="23 m" delta="-4 m" />
          <KpiCard label="Write-mode sessions" value="4" trend="down" delta="approval required" />
          <KpiCard label="Active now" value="0" hint="no live sessions" />
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Section title="Start a session" description="A banner is shown to the owner and to you for the entire session.">
            <div className="space-y-3 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="imp-owner">Owner account</Label>
                <Select value={owner} onValueChange={setOwner}>
                  <SelectTrigger id="imp-owner" className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {owners.map((o) => <SelectItem key={o.id} value={o.id}>{o.company}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="imp-mode">Access mode</Label>
                <Select value={mode} onValueChange={setMode}>
                  <SelectTrigger id="imp-mode" className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="read-only">Read-only (recommended)</SelectItem>
                    <SelectItem value="read-write">Read-write (needs approval)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="imp-duration">Session limit</Label>
                <Select value={duration} onValueChange={setDuration}>
                  <SelectTrigger id="imp-duration" className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="15">15 minutes</SelectItem>
                    <SelectItem value="30">30 minutes</SelectItem>
                    <SelectItem value="60">60 minutes</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="imp-reason">Reason (required)</Label>
                <Textarea id="imp-reason" rows={3} value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Ticket reference and what you need to verify…" />
              </div>
              <ConfirmDialog
                trigger={
                  <Button size="sm" className="h-8 w-full" disabled={reason.trim().length < 4}>
                    Start impersonation
                  </Button>
                }
                title={`Impersonate ${selected.company}?`}
                description={`${mode === "read-write" ? "Read-write" : "Read-only"} access for ${duration} minutes.`}
                impact={[
                  "Owner sees a persistent impersonation banner",
                  "Every action is attributed to you in the audit log",
                  "Session auto-terminates at the time limit",
                ]}
                confirmLabel="Start session"
                destructive={false}
                onConfirm={() => toast.success(`Impersonating ${selected.company}`, { description: `${mode} · ${duration} minutes` })}
              />
              <p className="text-xs text-muted-foreground">
                Guest payment data, card details and passwords stay masked in every session.
              </p>
            </div>
          </Section>

          <Section title="Session history" description="Every impersonation session, with the number of actions taken" className="xl:col-span-2">
            <DataTable
              rows={impersonationSessions}
              columns={columns}
              rowKey={(s) => `${s.admin}-${s.start}`}
              searchKeys={(s) => `${s.admin} ${s.target} ${s.owner}`}
              searchPlaceholder="Search administrator or owner…"
              exportName="ImpersonationSessions"
              pageSize={6}
              emptyTitle="No sessions yet"
              emptyDescription="Impersonation history appears here once a session ends."
            />
          </Section>
        </div>
      </div>
    </>
  );
}
