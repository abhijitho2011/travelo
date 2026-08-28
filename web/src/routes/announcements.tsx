import { createFileRoute } from "@tanstack/react-router";
import { Megaphone } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable, type Column } from "@/components/admin/data-table";
import { KpiCard, PageHeader, StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { announcements } from "@/lib/travelo-data";

export const Route = createFileRoute("/announcements")({
  head: () => ({
    meta: [
      { title: "Announcements · Travelo Super Admin" },
      { name: "description", content: "Broadcast maintenance windows, feature launches and policy updates to hotel owners and staff." },
      { property: "og:title", content: "Announcements · Travelo Super Admin" },
      { property: "og:description", content: "Platform-wide announcements and broadcasts." },
    ],
  }),
  component: AnnouncementsPage,
});

type Announcement = (typeof announcements)[number];

function AnnouncementsPage() {
  const columns: Column<Announcement>[] = [
    { key: "title", header: "Announcement", sortValue: (a) => a.title, cell: (a) => <span className="font-semibold">{a.title}</span> },
    { key: "audience", header: "Audience", cell: (a) => <span className="text-muted-foreground">{a.audience}</span> },
    { key: "channels", header: "Channels", cell: (a) => <span className="text-muted-foreground">{a.channels}</span> },
    { key: "priority", header: "Priority", cell: (a) => <span className={a.priority === "Critical" ? "font-semibold text-destructive" : a.priority === "High" ? "font-semibold text-warning" : ""}>{a.priority}</span> },
    { key: "sent", header: "Schedule", cell: (a) => <span className="tnum">{a.sent}</span> },
    { key: "status", header: "Status", cell: (a) => <StatusBadge status={a.status} /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Support"
        title="Announcements"
        description="Broadcasts to owners and hotel staff, targeted by plan, region or property."
        breadcrumbs={[{ label: "Super Admin", to: "/" }, { label: "Announcements" }]}
        actions={<ComposeDialog />}
      />
      <div className="space-y-4 p-4 lg:p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Published (30d)" value="6" delta="+2" />
          <KpiCard label="Scheduled" value="1" hint="02 Sep maintenance" />
          <KpiCard label="Average open rate" value="72%" delta="+5 pts" />
          <KpiCard label="Recipients reached" value="4,782" delta="+312" />
        </div>
        <DataTable
          rows={announcements}
          columns={columns}
          rowKey={(a) => a.title}
          searchKeys={(a) => `${a.title} ${a.audience}`}
          searchPlaceholder="Search announcements…"
          exportName="Announcements"
          emptyTitle="No announcements"
          emptyDescription="Compose a broadcast to reach owners and hotel staff."
        />
      </div>
    </>
  );
}

function ComposeDialog() {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8">
          <Megaphone aria-hidden className="mr-1.5 size-3.5" /> New announcement
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Compose announcement</DialogTitle>
          <DialogDescription>Delivered in-app and via the channels you select.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="ann-title">Title</Label>
            <Input id="ann-title" placeholder="Scheduled maintenance — 02 Sep" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="ann-body">Message</Label>
            <Textarea id="ann-body" rows={4} placeholder="What owners need to know…" />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="ann-audience">Audience</Label>
              <Select defaultValue="all">
                <SelectTrigger id="ann-audience" className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All owners</SelectItem>
                  <SelectItem value="plan">By plan</SelectItem>
                  <SelectItem value="region">By region</SelectItem>
                  <SelectItem value="selected">Selected hotels</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ann-priority">Priority</Label>
              <Select defaultValue="Normal">
                <SelectTrigger id="ann-priority" className="h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {["Critical", "High", "Normal", "Low"].map((p) => <SelectItem key={p} value={p}>{p}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => { setOpen(false); toast.success("Saved as draft"); }}>Save draft</Button>
          <Button onClick={() => { setOpen(false); toast.success("Announcement published"); }}>Publish now</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
