import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { PageHeader, Section } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLocationDistricts, useLocationStates } from "@/hooks/api/use-locations";
import { useCreateOwner, type CreateOwnerInput } from "@/hooks/api/use-owners";
import { usePlans } from "@/hooks/api/use-plans";
import { errorMessage } from "@/lib/api";
import { formatDate, inr } from "@/lib/format";

export const Route = createFileRoute("/owners/new")({
  head: () => ({
    meta: [
      { title: "New owner · Tavelo Super Admin" },
      { name: "description", content: "Create a hotel owner account on the Tavelo platform." },
    ],
  }),
  component: NewOwnerPage,
});

type FormState = {
  name: string;
  company: string;
  email: string;
  phone: string;
  gstNumber: string;
  address: string;
  pinCode: string;
  state: string;
  district: string;
  planId: string;
};

const EMPTY: FormState = {
  name: "",
  company: "",
  email: "",
  phone: "",
  gstNumber: "",
  address: "",
  pinCode: "",
  state: "",
  district: "",
  planId: "",
};

// Mirrors of the server rules. The server stays the authority; these only stop
// an obviously bad request before it is sent.
const PIN_RE = /^\d{6}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/;

/** Same normalisation the API applies: strip +91, spaces and trunk zeros. */
function normaliseMobile(raw: string): string {
  let digits = raw.replace(/\D+/g, "");
  if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(2);
  return digits.replace(/^0+/, "");
}

function validate(form: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (form.name.trim().length < 2) errors.name = "Enter the owner's full name.";
  if (form.company.trim().length < 2) errors.company = "Enter the company or business name.";
  if (!EMAIL_RE.test(form.email.trim())) errors.email = "Enter a valid email address.";
  if (!/^[6-9]\d{9}$/.test(normaliseMobile(form.phone)))
    errors.phone = "Enter a 10-digit Indian mobile number.";
  if (form.address.trim().length < 3) errors.address = "Enter the street address.";
  if (!PIN_RE.test(form.pinCode.trim())) errors.pinCode = "PIN code must be exactly 6 digits.";
  if (!form.state) errors.state = "Select a state.";
  if (!form.district) errors.district = "Select a district.";
  if (!form.planId) errors.planId = "Select a subscription plan.";
  const gst = form.gstNumber.trim().toUpperCase();
  if (gst && !GSTIN_RE.test(gst))
    errors.gstNumber = "GSTIN must be 15 characters, e.g. 29ABCDE1234F1Z5.";
  return errors;
}

function FieldError({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

function NewOwnerPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [touched, setTouched] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const createOwner = useCreateOwner();
  const states = useLocationStates();
  const districts = useLocationDistricts(form.state || null);
  const plans = usePlans();

  const activePlans = useMemo(
    () => (plans.data ?? []).filter((p) => p.status !== "Inactive"),
    [plans.data],
  );
  const selectedPlan = activePlans.find((p) => p.id === form.planId) ?? null;

  const errors = validate(form);
  const invalid = Object.keys(errors).length > 0;

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  // Changing the state invalidates whatever district was picked under the old one.
  const setState = (stateId: string) => setForm((f) => ({ ...f, state: stateId, district: "" }));

  /** Preview of the period the admin is about to commit the owner to. */
  const periodEnd = useMemo(() => {
    if (!selectedPlan) return null;
    const start = new Date();
    const day = start.getUTCDate();
    const absolute =
      start.getUTCFullYear() * 12 + start.getUTCMonth() + selectedPlan.durationMonths;
    const year = Math.floor(absolute / 12);
    const month = absolute - year * 12;
    const lastDay = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
    const end = new Date(start.getTime());
    end.setUTCFullYear(year, month, Math.min(day, lastDay));
    return end;
  }, [selectedPlan]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    setError(null);
    if (invalid) return;

    const payload: CreateOwnerInput = {
      name: form.name.trim(),
      company: form.company.trim(),
      email: form.email.trim(),
      phone: normaliseMobile(form.phone),
      address: form.address.trim(),
      pinCode: form.pinCode.trim(),
      state: form.state,
      district: form.district,
      planId: form.planId,
    };
    const gst = form.gstNumber.trim().toUpperCase();
    if (gst) payload.gstNumber = gst;

    try {
      const owner = await createOwner.mutateAsync(payload);
      toast.success("Owner created", {
        description: `${owner.company ?? owner.name} is on ${owner.subscription.plan} until ${formatDate(owner.subscription.currentPeriodEnd)}.`,
      });
      navigate({ to: "/owners/$ownerId", params: { ownerId: owner.id } });
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      toast.error("Could not create owner", { description: message });
    }
  };

  const showError = (key: keyof FormState) => (touched ? errors[key] : undefined);
  const noStates = !states.isLoading && !states.error && (states.data?.length ?? 0) === 0;

  return (
    <>
      <PageHeader
        eyebrow="Customers"
        title="New owner"
        description="Every owner starts on a subscription — the plan is chosen here, not later."
        breadcrumbs={[{ label: "Owners", to: "/owners" }, { label: "New owner" }]}
      />

      <div className="max-w-3xl p-5 lg:p-6">
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <div
              role="alert"
              className="rounded-md border border-destructive/25 bg-destructive-soft px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          <Section title="Owner details" description="Who runs the account.">
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="owner-name">Full name *</Label>
                <Input id="owner-name" value={form.name} onChange={set("name")} />
                <FieldError message={showError("name")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="owner-company">Company / business name *</Label>
                <Input id="owner-company" value={form.company} onChange={set("company")} />
                <FieldError message={showError("company")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="owner-email">Email *</Label>
                <Input
                  id="owner-email"
                  type="email"
                  value={form.email}
                  onChange={set("email")}
                  autoComplete="off"
                />
                <FieldError message={showError("email")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="owner-phone">Mobile *</Label>
                <Input
                  id="owner-phone"
                  inputMode="tel"
                  placeholder="9876543210"
                  value={form.phone}
                  onChange={set("phone")}
                />
                <FieldError message={showError("phone")} />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="owner-gst">
                  GST number <span className="font-normal text-muted-foreground">(Optional)</span>
                </Label>
                <Input
                  id="owner-gst"
                  placeholder="29ABCDE1234F1Z5"
                  value={form.gstNumber}
                  onChange={set("gstNumber")}
                />
                <FieldError message={showError("gstNumber")} />
              </div>
            </div>
          </Section>

          <Section
            title="Address"
            description="State and district come from the admin location catalogue."
          >
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="owner-address">Street address *</Label>
                <Input id="owner-address" value={form.address} onChange={set("address")} />
                <FieldError message={showError("address")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="owner-pin">PIN code *</Label>
                <Input
                  id="owner-pin"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="682031"
                  value={form.pinCode}
                  onChange={set("pinCode")}
                />
                <FieldError message={showError("pinCode")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="owner-state">State *</Label>
                <Select value={form.state} onValueChange={setState}>
                  <SelectTrigger id="owner-state" disabled={noStates}>
                    <SelectValue placeholder={states.isLoading ? "Loading…" : "Select a state"} />
                  </SelectTrigger>
                  <SelectContent>
                    {(states.data ?? []).map((s) => (
                      <SelectItem key={s.id} value={s.id}>
                        {s.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {noStates ? (
                  <p className="text-xs text-muted-foreground">
                    No states configured yet — add them in{" "}
                    <Link to="/settings" className="underline">
                      Settings → Locations
                    </Link>
                    .
                  </p>
                ) : (
                  <FieldError message={showError("state")} />
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="owner-district">District *</Label>
                <Select
                  value={form.district}
                  onValueChange={(district) => setForm((f) => ({ ...f, district }))}
                  disabled={!form.state}
                >
                  <SelectTrigger id="owner-district">
                    <SelectValue
                      placeholder={
                        !form.state
                          ? "Select a state first"
                          : districts.isLoading
                            ? "Loading…"
                            : "Select a district"
                      }
                    />
                  </SelectTrigger>
                  <SelectContent>
                    {(districts.data ?? []).map((d) => (
                      <SelectItem key={d.id} value={d.id}>
                        {d.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {form.state && !districts.isLoading && (districts.data?.length ?? 0) === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    This state has no districts yet — add them in{" "}
                    <Link to="/settings" className="underline">
                      Settings → Locations
                    </Link>
                    .
                  </p>
                ) : (
                  <FieldError message={showError("district")} />
                )}
              </div>
            </div>
          </Section>

          <Section
            title="Subscription"
            description="Required — the owner and their subscription are created together."
          >
            <div className="space-y-3 p-4">
              <div className="space-y-1.5">
                <Label htmlFor="owner-plan">Plan *</Label>
                <Select
                  value={form.planId}
                  onValueChange={(planId) => setForm((f) => ({ ...f, planId }))}
                >
                  <SelectTrigger id="owner-plan" disabled={activePlans.length === 0}>
                    <SelectValue placeholder={plans.isLoading ? "Loading…" : "Select a plan"} />
                  </SelectTrigger>
                  <SelectContent>
                    {activePlans.map((p) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name} — {inr(p.periodPrice)} /{" "}
                        {p.durationMonths === 1 ? "month" : `${p.durationMonths} months`}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {!plans.isLoading && activePlans.length === 0 ? (
                  <p className="text-xs text-muted-foreground">
                    No active plans —{" "}
                    <Link to="/plans" className="underline">
                      create one first
                    </Link>
                    .
                  </p>
                ) : (
                  <FieldError message={showError("planId")} />
                )}
              </div>

              {selectedPlan && periodEnd && (
                <dl className="grid gap-2 rounded-md border border-border bg-surface-muted px-3 py-2 text-sm sm:grid-cols-3">
                  <div>
                    <dt className="text-xs text-muted-foreground">Charged now</dt>
                    <dd className="tnum font-semibold">{inr(selectedPlan.periodPrice)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Duration</dt>
                    <dd className="tnum font-semibold">
                      {selectedPlan.durationMonths === 1
                        ? "1 month"
                        : `${selectedPlan.durationMonths} months`}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs text-muted-foreground">Subscription ends</dt>
                    <dd className="tnum font-semibold">{formatDate(periodEnd)}</dd>
                  </div>
                </dl>
              )}
            </div>
          </Section>

          <div className="flex items-center justify-end gap-2">
            <Button asChild variant="outline" type="button">
              <Link to="/owners">Cancel</Link>
            </Button>
            {/* A plan is mandatory, so submit stays locked until one is chosen. */}
            <Button
              type="submit"
              disabled={createOwner.isPending || !form.planId || (touched && invalid)}
            >
              {createOwner.isPending && (
                <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />
              )}
              Create owner
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
