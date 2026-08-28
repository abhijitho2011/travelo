import { createFileRoute } from "@tanstack/react-router";
import { Copy, MoreHorizontal, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable, type Column } from "@/components/admin/data-table";
import { PageHeader, StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { entitlements, inr, plans } from "@/lib/travelo-data";

export const Route = createFileRoute("/plans")({
  head: () => ({
    meta: [
      { title: "Subscription Plans · Travelo Super Admin" },
      { name: "description", content: "Create and manage Travelo subscription plans, pricing and feature entitlements." },
      { property: "og:title", content: "Subscription Plans · Travelo Super Admin" },
      { property: "og:description", content: "Plan pricing, property limits and module entitlements." },
    ],
  }),
  component: PlansPage,
});

type Plan = (typeof plans)[number];

function PlansPage() {
  const columns: Column<Plan>[] = [
    { key: "plan", header: "Plan", sortValue: (p) => p.name, cell: (p) => <span className="font-semibold">{p.name}</span> },
    { key: "limit", header: "Property limit", align: "right", sortValue: (p) => p.limit, cell: (p) => <span className="tnum">{p.limit}</span> },
    { key: "monthly", header: "Monthly", align: "right", sortValue: (p) => p.monthly, cell: (p) => <span className="tnum">{inr(p.monthly)}</span> },
    { key: "annual", header: "Annual", align: "right", sortValue: (p) => p.annual, cell: (p) => <span className="tnum">{inr(p.annual)}</span> },
    {
      key: "features", header: "Features",
      cell: (p) => (
        <span className="flex flex-wrap gap-1">
          {p.features.slice(0, 3).map((f) => (
            <span key={f} className="rounded border border-border bg-surface-muted px-1.5 py-0.5 text-[11px] text-muted-foreground">{f}</span>
          ))}
          {p.features.length > 3 && <span className="text-[11px] text-muted-foreground">+{p.features.length - 3}</span>}
        </span>
      ),
    },
    { key: "subs", header: "Subscribers", align: "right", sortValue: (p) => p.subscribers, cell: (p) => <span className="tnum">{p.subscribers}</span> },
    { key: "status", header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Monetization"
        title="Subscription Plans"
        description="Pricing, property limits and module entitlements offered to hotel owners."
        breadcrumbs={[{ label: "Super Admin", to: "/" }, { label: "Subscription Plans" }]}
        actions={<CreatePlanDialog />}
      />
      <div className="p-4 lg:p-6">
        <DataTable
          rows={plans}
          columns={columns}
          rowKey={(p) => p.id}
          searchKeys={(p) => `${p.name} ${p.features.join(" ")}`}
          searchPlaceholder="Search plans…"
          exportName="Plans"
          rowActions={(p) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7" aria-label={`Actions for ${p.name}`}>
                  <MoreHorizontal aria-hidden className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => toast.info(`Editing ${p.name}`)}>Edit plan</DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.success(`${p.name} duplicated`)}>
                  <Copy aria-hidden className="mr-2 size-4" /> Duplicate
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.success(`${p.name} ${p.status === "Active" ? "deactivated" : "activated"}`)}>
                  {p.status === "Active" ? "Deactivate" : "Activate"}
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          emptyTitle="No plans yet"
          emptyDescription="Create your first subscription plan to start onboarding paying owners."
        />
      </div>
    </>
  );
}

function CreatePlanDialog() {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>(["PMS", "Booking Engine", "Analytics"]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8">
          <Plus aria-hidden className="mr-1.5 size-3.5" /> Create plan
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Create subscription plan</DialogTitle>
          <DialogDescription>Pricing and entitlements apply to new subscriptions immediately.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-4 sm:grid-cols-2">
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="plan-name">Plan name</Label>
            <Input id="plan-name" placeholder="Growth Plus" />
          </div>
          <div className="space-y-1.5 sm:col-span-2">
            <Label htmlFor="plan-desc">Description</Label>
            <Textarea id="plan-desc" rows={2} placeholder="For groups scaling past five properties…" />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-limit">Property limit</Label>
            <Input id="plan-limit" type="number" defaultValue={5} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-monthly">Monthly price (₹)</Label>
            <Input id="plan-monthly" type="number" defaultValue={100000} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-annual">Annual price (₹)</Label>
            <Input id="plan-annual" type="number" defaultValue={1000000} />
          </div>
        </div>
        <fieldset className="mt-2">
          <legend className="mb-2 text-sm font-semibold">Feature entitlements</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {entitlements.map((f) => (
              <label key={f} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                <Checkbox
                  checked={selected.includes(f)}
                  onCheckedChange={(v) => setSelected((s) => (v ? [...s, f] : s.filter((x) => x !== f)))}
                />
                {f}
              </label>
            ))}
          </div>
        </fieldset>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={() => {
              setOpen(false);
              toast.success("Plan created", { description: `${selected.length} modules enabled.` });
            }}
          >
            Create plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
