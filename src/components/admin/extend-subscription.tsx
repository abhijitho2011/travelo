import { CalendarPlus, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { MetricRow } from "@/components/admin/primitives";
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { useExtendSubscription } from "@/hooks/api/use-subscriptions";
import type { Subscription } from "@/hooks/api/types";
import { errorMessage } from "@/lib/api";
import { formatDate } from "@/lib/format";

const PRESETS = [
  { value: "30", label: "30 days" },
  { value: "90", label: "90 days" },
  { value: "182", label: "6 months" },
  { value: "365", label: "12 months" },
  { value: "custom", label: "Custom" },
];

function addDays(from: string | null | undefined, days: number) {
  if (!from) return "—";
  const parsed = new Date(from);
  if (Number.isNaN(parsed.getTime())) return "—";
  parsed.setDate(parsed.getDate() + days);
  return formatDate(parsed);
}

export function ExtendSubscriptionDialog({
  subscription,
  variant = "default",
}: {
  subscription: Pick<Subscription, "id" | "owner" | "plan" | "currentPeriodEnd">;
  variant?: "default" | "outline" | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [choice, setChoice] = useState("90");
  const [customDays, setCustomDays] = useState("30");
  const [reason, setReason] = useState("");
  const extend = useExtendSubscription();

  const days = choice === "custom" ? Number(customDays) || 0 : Number(choice);
  const newExpiry = addDays(subscription.currentPeriodEnd, days);
  const invalid = days < 1 || days > 3650 || reason.trim().length < 4;

  const submit = async () => {
    try {
      await extend.mutateAsync({ id: subscription.id, days, reason: reason.trim() });
      toast.success("Subscription extended", {
        description: `${subscription.owner ?? "Owner"} now runs to ${newExpiry}.`,
      });
      setOpen(false);
      setReason("");
    } catch (error) {
      toast.error("Could not extend subscription", { description: errorMessage(error) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" variant={variant} className="h-8">
          <CalendarPlus aria-hidden className="mr-1.5 size-3.5" /> Extend
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
          <MetricRow label="Owner" value={subscription.owner ?? "—"} />
          <MetricRow label="Current plan" value={subscription.plan} />
          <MetricRow label="Current expiry" value={formatDate(subscription.currentPeriodEnd)} />
        </dl>

        <fieldset className="space-y-2">
          <legend className="text-sm font-semibold">Extension period</legend>
          <RadioGroup value={choice} onValueChange={setChoice} className="grid grid-cols-2 gap-2">
            {PRESETS.map((o) => (
              <div
                key={o.value}
                className="flex items-center gap-2 rounded-md border border-border px-3 py-2"
              >
                <RadioGroupItem id={`ext-${o.value}`} value={o.value} />
                <Label htmlFor={`ext-${o.value}`} className="text-sm font-normal">
                  {o.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
          {choice === "custom" && (
            <Input
              type="number"
              min={1}
              max={3650}
              value={customDays}
              onChange={(e) => setCustomDays(e.target.value)}
              aria-label="Custom number of days"
              placeholder="Days"
            />
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

        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={extend.isPending}>
            Cancel
          </Button>
          <Button disabled={invalid || extend.isPending} onClick={() => void submit()}>
            {extend.isPending && <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />}
            Confirm extension
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
