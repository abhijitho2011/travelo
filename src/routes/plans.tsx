import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { AsyncSection, PageHeader, Section, StatusBadge } from "@/components/admin/primitives";
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
import { useArchivePlan, useCreatePlan, usePlans } from "@/hooks/api/use-plans";
import { errorMessage } from "@/lib/api";
import { inr, num } from "@/lib/format";

export const Route = createFileRoute("/plans")({
  head: () => ({
    meta: [
      { title: "Subscription plans · Tavelo Super Admin" },
      { name: "description", content: "Pricing tiers, property limits and bundled features." },
    ],
  }),
  component: PlansPage,
});

function CreatePlanDialog() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [monthly, setMonthly] = useState("");
  const [annual, setAnnual] = useState("");
  const [limit, setLimit] = useState("1");
  const [duration, setDuration] = useState("1");
  const createPlan = useCreatePlan();

  const durationMonths = Number(duration);
  const durationValid =
    Number.isInteger(durationMonths) && durationMonths >= 1 && durationMonths <= 120;
  const invalid =
    name.trim().length < 2 ||
    !monthly.trim() ||
    !annual.trim() ||
    Number(limit) < 1 ||
    !durationValid;

  // The period total is always monthly x duration — one source of truth.
  const periodPreview =
    durationValid && monthly.trim()
      ? inr(Math.round(Number(monthly) * 100) * durationMonths)
      : null;

  const submit = async () => {
    try {
      // Prices are entered in rupees and stored by the API in paise.
      await createPlan.mutateAsync({
        name: name.trim(),
        description: description.trim() || undefined,
        monthlyPrice: Math.round(Number(monthly) * 100),
        annualPrice: Math.round(Number(annual) * 100),
        propertyLimit: Number(limit),
        durationMonths,
      });
      toast.success("Plan created", { description: `${name.trim()} is now available.` });
      setOpen(false);
      setName("");
      setDescription("");
      setMonthly("");
      setAnnual("");
      setLimit("1");
      setDuration("1");
    } catch (error) {
      toast.error("Could not create plan", { description: errorMessage(error) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button size="sm" className="h-8">
          <Plus aria-hidden className="mr-1.5 size-3.5" /> New plan
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Create subscription plan</DialogTitle>
          <DialogDescription>Prices are entered in rupees.</DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="plan-name">Name</Label>
            <Input id="plan-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="plan-description">Description</Label>
            <Textarea
              id="plan-description"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="plan-monthly">Monthly price (₹)</Label>
              <Input
                id="plan-monthly"
                type="number"
                min={0}
                value={monthly}
                onChange={(e) => setMonthly(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-annual">Annual price (₹)</Label>
              <Input
                id="plan-annual"
                type="number"
                min={0}
                value={annual}
                onChange={(e) => setAnnual(e.target.value)}
              />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="plan-limit">Property limit</Label>
              <Input
                id="plan-limit"
                type="number"
                min={1}
                value={limit}
                onChange={(e) => setLimit(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="plan-duration">Duration (months)</Label>
              <Input
                id="plan-duration"
                type="number"
                min={1}
                max={120}
                value={duration}
                onChange={(e) => setDuration(e.target.value)}
                aria-describedby="plan-duration-help"
              />
              <div className="flex flex-wrap gap-1.5">
                {DURATION_QUICK_PICKS.map((m) => (
                  <Button
                    key={m}
                    type="button"
                    size="sm"
                    variant={durationMonths === m ? "default" : "outline"}
                    className="h-6 px-2 text-[11px]"
                    onClick={() => setDuration(String(m))}
                  >
                    {m}m
                  </Button>
                ))}
              </div>
              <p id="plan-duration-help" className="text-xs text-muted-foreground">
                {durationValid
                  ? periodPreview
                    ? `Charged ${periodPreview} per ${durationLabel(durationMonths)}.`
                    : "Monthly price is the per-month rate."
                  : "Enter a whole number of months between 1 and 120."}
              </p>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={invalid || createPlan.isPending} onClick={() => void submit()}>
            {createPlan.isPending && <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />}
            Create plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

const DURATION_QUICK_PICKS = [1, 3, 6, 12];

/** "month" / "3 months" — used in both the form hint and the plan card. */
function durationLabel(months: number): string {
  return months === 1 ? "month" : `${months} months`;
}

function PlansPage() {
  const plans = usePlans();
  const archivePlan = useArchivePlan();

  const archive = async (id: string, name: string) => {
    try {
      await archivePlan.mutateAsync(id);
      toast.success("Plan archived", { description: `${name} is no longer offered.` });
    } catch (error) {
      toast.error("Could not archive plan", { description: errorMessage(error) });
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Monetization"
        title="Subscription plans"
        description="Pricing tiers, property allowances and bundled features."
        actions={<CreatePlanDialog />}
      />

      <div className="p-5 lg:p-6">
        <AsyncSection
          loading={plans.isLoading}
          error={plans.error}
          onRetry={() => plans.refetch()}
          isEmpty={(plans.data?.length ?? 0) === 0}
          emptyTitle="No plans defined"
          emptyDescription="Create the first subscription plan to start billing owners."
        >
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {plans.data?.map((plan) => (
              <Section
                key={plan.id}
                title={plan.name}
                actions={<StatusBadge status={plan.status} />}
              >
                <div className="space-y-3 p-4">
                  <p className="text-sm text-muted-foreground">
                    {plan.description ?? "No description."}
                  </p>
                  <p className="tnum text-2xl font-bold">
                    {inr(plan.periodPrice)}
                    <span className="text-sm font-normal text-muted-foreground">
                      {" "}
                      / {durationLabel(plan.durationMonths)}
                    </span>
                  </p>
                  <p className="tnum text-sm text-muted-foreground">
                    {inr(plan.monthly)} per month × {num(plan.durationMonths)}
                  </p>
                  <dl className="grid grid-cols-2 gap-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm">
                    <div>
                      <dt className="text-xs text-muted-foreground">Property limit</dt>
                      <dd className="tnum font-semibold">{num(plan.limit)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Subscribers</dt>
                      <dd className="tnum font-semibold">{num(plan.subscribers)}</dd>
                    </div>
                    <div>
                      <dt className="text-xs text-muted-foreground">Duration</dt>
                      <dd className="tnum font-semibold">{durationLabel(plan.durationMonths)}</dd>
                    </div>
                  </dl>
                  {plan.features.length > 0 && (
                    <ul className="flex flex-wrap gap-1.5">
                      {plan.features.map((f) => (
                        <li
                          key={f}
                          className="rounded border border-border bg-surface-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {f}
                        </li>
                      ))}
                    </ul>
                  )}
                  {plan.status !== "Inactive" && (
                    <ConfirmDialog
                      confirmLabel="Archive plan"
                      title="Archive plan"
                      description={`${plan.name} will no longer be offered to new owners.`}
                      impact={[
                        "Existing subscriptions keep running",
                        "The plan is hidden from signup",
                      ]}
                      onConfirm={() => archive(plan.id, plan.name)}
                      trigger={
                        <Button variant="outline" size="sm" className="w-full">
                          Archive plan
                        </Button>
                      }
                    />
                  )}
                </div>
              </Section>
            ))}
          </div>
        </AsyncSection>
      </div>
    </>
  );
}
