import { CalendarPlus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { MetricRow } from "@/components/admin/primitives";

const options = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "182", label: "6 months" },
  { value: "365", label: "12 months" },
  { value: "custom", label: "Custom date" },
];

function addDays(dateLabel: string, days: number) {
  const parsed = new Date(dateLabel);
  if (Number.isNaN(parsed.getTime())) return "—";
  parsed.setDate(parsed.getDate() + days);
  return parsed.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function ExtendSubscriptionDialog({
  owner,
  variant = "default",
}: {
  owner: { company: string; plan: string; expiry: string };
  variant?: "default" | "outline";
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState("90");
  const [custom, setCustom] = useState("");
  const [reason, setReason] = useState("");

  const newExpiry = choice === "custom" ? (custom || "—") : addDays(owner.expiry, Number(choice));

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={variant} className="h-8">
          <CalendarPlus aria-hidden className="mr-1.5 size-3.5" /> Extend subscription
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Extend subscription</DialogTitle>
          <DialogDescription>
            Extensions take effect immediately and are written to the audit log.
          </DialogDescription>
        </DialogHeader>

        <dl className="rounded-md border border-border bg-surface-muted px-3 py-1">
          <MetricRow label="Owner" value={owner.company} />
          <MetricRow label="Current plan" value={owner.plan} />
          <MetricRow label="Current expiry" value={owner.expiry} />
        </dl>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Extension period</legend>
          <RadioGroup value={choice} onValueChange={setChoice} className="grid grid-cols-2 gap-2">
            {options.map((o) => (
              <div key={o.value} className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
                <RadioGroupItem id={`ext-${o.value}`} value={o.value} />
                <Label htmlFor={`ext-${o.value}`} className="text-sm font-normal">{o.label}</Label>
              </div>
            ))}
          </RadioGroup>
          {choice === "custom" && (
            <Input type="date" value={custom} onChange={(e) => setCustom(e.target.value)} aria-label="Custom expiry date" />
          )}
        </fieldset>

        <div className="flex items-center justify-between rounded-md border border-success/25 bg-success-soft px-3 py-2 text-sm">
          <span className="text-muted-foreground">New expiry</span>
          <span className="tnum font-bold text-success">{newExpiry}</span>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="extend-reason">Reason (required)</Label>
          <Textarea
            id="extend-reason"
            rows={2}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Goodwill after integration outage…"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="extend-note">Internal note</Label>
          <Input id="extend-note" placeholder="Visible to admins only" />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            disabled={reason.trim().length < 4}
            onClick={() => {
              setOpen(false);
              toast.success("Subscription extended", {
                description: `${owner.company} now expires ${newExpiry}. Audit entry created.`,
              });
              setReason("");
            }}
          >
            Confirm extension
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function PropertyLimitDialog({
  owner,
}: {
  owner: { company: string; properties: number };
}) {
  const [open, setOpen] = useState(false);
  const [limit, setLimit] = useState(String(owner.properties + 3));
  const [mode, setMode] = useState("permanent");
  const delta = Math.max(0, Number(limit) - owner.properties);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant="outline" className="h-8">Change property limit</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Property allowance</DialogTitle>
          <DialogDescription>{owner.company}</DialogDescription>
        </DialogHeader>
        <dl className="rounded-md border border-border bg-surface-muted px-3 py-1">
          <MetricRow label="Current allowance" value={`${owner.properties} properties`} />
          <MetricRow label="New allowance" value={`${limit} properties`} />
          <MetricRow label="Pricing impact" value={`+₹${(delta * 20000).toLocaleString("en-IN")}/mo`} />
        </dl>
        <div className="space-y-1.5">
          <Label htmlFor="new-limit">New limit</Label>
          <Input id="new-limit" type="number" min={1} value={limit} onChange={(e) => setLimit(e.target.value)} />
        </div>
        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Type</legend>
          <RadioGroup value={mode} onValueChange={setMode} className="grid gap-2">
            <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
              <RadioGroupItem id="limit-perm" value="permanent" />
              <Label htmlFor="limit-perm" className="text-sm font-normal">Permanent increase</Label>
            </div>
            <div className="flex items-center gap-2 rounded-md border border-border px-3 py-2">
              <RadioGroupItem id="limit-temp" value="temporary" />
              <Label htmlFor="limit-temp" className="text-sm font-normal">Temporary (reverts at renewal)</Label>
            </div>
          </RadioGroup>
        </fieldset>
        <div className="space-y-1.5">
          <Label htmlFor="limit-effective">Effective date</Label>
          <Input id="limit-effective" type="date" defaultValue="2026-09-01" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="limit-reason">Reason</Label>
          <Textarea id="limit-reason" rows={2} placeholder="Upgrade requested via ticket…" />
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>Cancel</Button>
          <Button
            onClick={() => {
              setOpen(false);
              toast.success("Property limit updated", { description: `${owner.company}: ${limit} properties (${mode}).` });
            }}
          >
            Apply change
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
