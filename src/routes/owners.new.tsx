import { createFileRoute, Link } from "@tanstack/react-router";
import { Check, ChevronLeft, ChevronRight, CircleCheck, Loader2 } from "lucide-react";
import { useState } from "react";

import { MetricRow, PageHeader, Section } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { inr, plans } from "@/lib/travelo-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/owners/new")({
  head: () => ({
    meta: [
      { title: "Onboard owner · Travelo Super Admin" },
      { name: "description", content: "Three-step owner onboarding: account details, subscription and review." },
      { property: "og:title", content: "Onboard owner · Travelo Super Admin" },
      { property: "og:description", content: "Create an owner account and activate their subscription." },
    ],
  }),
  component: AddOwnerPage,
});

const steps = ["Owner information", "Subscription", "Review"];

function AddOwnerPage() {
  const [step, setStep] = useState(0);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    name: "", email: "", phone: "", company: "", address: "",
    country: "India", state: "Kerala", city: "",
    plan: "Growth", cycle: "Annual", allowance: "5",
    start: "2026-09-01", expiry: "2027-08-31", discount: "0",
  });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));
  const selectedPlan = plans.find((p) => p.name === form.plan)!;
  const price = form.cycle === "Annual" ? selectedPlan.annual : selectedPlan.monthly;
  const net = price * (1 - Number(form.discount || 0) / 100);

  if (done) {
    return (
      <>
        <PageHeader eyebrow="Customers" title="Owner created" breadcrumbs={[{ label: "Owners", to: "/owners" }, { label: "New owner" }]} />
        <div className="p-4 lg:p-6">
          <Section>
            <div className="flex flex-col items-center px-6 py-12 text-center">
              <CircleCheck aria-hidden className="size-10 text-success" />
              <h2 className="mt-3 text-lg font-bold">{form.company || "New Hospitality Pvt Ltd"} is live</h2>
              <ul className="mt-4 space-y-1.5 text-sm">
                {["Owner created", "Subscription activated", "Owner login ready"].map((s) => (
                  <li key={s} className="flex items-center gap-2 text-foreground">
                    <Check aria-hidden className="size-4 text-success" /> {s}
                  </li>
                ))}
              </ul>
              <p className="mt-3 max-w-md text-sm text-muted-foreground">
                A welcome email with sign-in instructions was sent to {form.email || "the owner"}. The owner can now
                create hotels, and their properties will appear in monitoring automatically.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-2">
                <Button asChild size="sm">
                  <Link to="/owners">Back to owners</Link>
                </Button>
                <Button asChild variant="outline" size="sm">
                  <Link to="/subscriptions">View subscription</Link>
                </Button>
              </div>
            </div>
          </Section>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Customers"
        title="Onboard new owner"
        description="Create the account, attach a subscription, review, then activate."
        breadcrumbs={[{ label: "Owners", to: "/owners" }, { label: "New owner" }]}
      />
      <div className="mx-auto max-w-3xl p-4 lg:p-6">
        <ol className="mb-4 flex items-center gap-2">
          {steps.map((s, i) => (
            <li key={s} className="flex flex-1 items-center gap-2">
              <span
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full text-xs font-bold",
                  i < step && "bg-success text-success-foreground",
                  i === step && "bg-primary text-primary-foreground",
                  i > step && "border border-border bg-surface text-muted-foreground",
                )}
              >
                {i < step ? <Check aria-hidden className="size-3.5" /> : i + 1}
              </span>
              <span className={cn("truncate text-xs font-semibold", i === step ? "text-foreground" : "text-muted-foreground")}>
                {s}
              </span>
              {i < steps.length - 1 && <span aria-hidden className="h-px flex-1 bg-border" />}
            </li>
          ))}
        </ol>

        <Section title={steps[step] ?? ""}>
          <div className="p-4">
            {step === 0 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Owner name" id="name" value={form.name} onChange={set("name")} placeholder="Rajesh Menon" />
                <Field label="Company / legal entity" id="company" value={form.company} onChange={set("company")} placeholder="ABC Hospitality Pvt Ltd" />
                <Field label="Email" id="email" type="email" value={form.email} onChange={set("email")} placeholder="owner@company.in" />
                <Field label="Phone" id="phone" value={form.phone} onChange={set("phone")} placeholder="+91 98470 11234" />
                <div className="sm:col-span-2 space-y-1.5">
                  <Label htmlFor="address">Registered address</Label>
                  <Textarea id="address" rows={2} value={form.address} onChange={(e) => set("address")(e.target.value)} />
                </div>
                <Field label="Country" id="country" value={form.country} onChange={set("country")} />
                <Field label="State" id="state" value={form.state} onChange={set("state")} />
                <Field label="City" id="city" value={form.city} onChange={set("city")} placeholder="Kochi" />
              </div>
            )}

            {step === 1 && (
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-1.5">
                  <Label htmlFor="plan">Plan</Label>
                  <Select value={form.plan} onValueChange={set("plan")}>
                    <SelectTrigger id="plan"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {plans.filter((p) => p.status === "Active").map((p) => (
                        <SelectItem key={p.id} value={p.name}>
                          {p.name} — {inr(p.monthly)}/mo · up to {p.limit} properties
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="cycle">Billing cycle</Label>
                  <Select value={form.cycle} onValueChange={set("cycle")}>
                    <SelectTrigger id="cycle"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="Monthly">Monthly</SelectItem>
                      <SelectItem value="Annual">Annual (2 months free)</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Field label="Property allowance" id="allowance" value={form.allowance} onChange={set("allowance")} />
                <Field label="Discount (%)" id="discount" value={form.discount} onChange={set("discount")} />
                <Field label="Start date" id="start" type="date" value={form.start} onChange={set("start")} />
                <Field label="Expiry date" id="expiry" type="date" value={form.expiry} onChange={set("expiry")} />
                <div className="sm:col-span-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm">
                  <span className="text-muted-foreground">Billed now: </span>
                  <span className="tnum font-bold">{inr(net)}</span>
                  <span className="text-muted-foreground"> ({form.cycle.toLowerCase()}, incl. {form.discount || 0}% discount)</span>
                </div>
              </div>
            )}

            {step === 2 && (
              <dl className="grid gap-x-8 sm:grid-cols-2">
                <MetricRow label="Owner" value={form.name || "—"} />
                <MetricRow label="Company" value={form.company || "—"} />
                <MetricRow label="Email" value={form.email || "—"} />
                <MetricRow label="Phone" value={form.phone || "—"} />
                <MetricRow label="Location" value={`${form.city || "—"}, ${form.state}, ${form.country}`} />
                <MetricRow label="Plan" value={`${form.plan} · ${form.cycle}`} />
                <MetricRow label="Property allowance" value={form.allowance} />
                <MetricRow label="Feature entitlements" value={`${selectedPlan.features.length} modules`} />
                <MetricRow label="Start" value={form.start} />
                <MetricRow label="Expiry" value={form.expiry} />
                <MetricRow label="Amount" value={inr(net)} />
              </dl>
            )}
          </div>
          <div className="flex items-center justify-between border-t border-border px-4 py-3">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setStep((s) => Math.max(0, s - 1))}
              disabled={step === 0}
            >
              <ChevronLeft aria-hidden className="mr-1.5 size-3.5" /> Back
            </Button>
            {step < 2 ? (
              <Button size="sm" onClick={() => setStep((s) => s + 1)}>
                Continue <ChevronRight aria-hidden className="ml-1.5 size-3.5" />
              </Button>
            ) : (
              <Button
                size="sm"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  setTimeout(() => {
                    setBusy(false);
                    setDone(true);
                  }, 900);
                }}
              >
                {busy ? (
                  <>
                    <Loader2 aria-hidden className="mr-2 size-4 animate-spin" /> Creating owner…
                  </>
                ) : (
                  "Create owner"
                )}
              </Button>
            )}
          </div>
        </Section>
      </div>
    </>
  );
}

function Field({
  label, id, value, onChange, type = "text", placeholder,
}: {
  label: string; id: string; value: string; onChange: (v: string) => void; type?: string; placeholder?: string;
}) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} type={type} value={value} placeholder={placeholder} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}
