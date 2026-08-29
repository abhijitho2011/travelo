import { Loader2 } from "lucide-react";
import { type ReactNode, useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
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
import { useUpdateOwner, type UpdateOwnerInput } from "@/hooks/api/use-owners";
import type { Owner } from "@/hooks/api/types";
import { errorMessage } from "@/lib/api";

const OWNER_STATUSES = ["ACTIVE", "PENDING", "SUSPENDED", "BLOCKED"];

// Mirrors of the server rules — they only stop an obviously bad request early.
const PIN_RE = /^\d{6}$/;
const GSTIN_RE = /^\d{2}[A-Z]{5}\d{4}[A-Z]\d[Z][A-Z\d]$/;

/** Same normalisation the API applies: strip +91, spaces and trunk zeros. */
function normaliseMobile(raw: string): string {
  let digits = raw.replace(/\D+/g, "");
  if (digits.length > 10 && digits.startsWith("91")) digits = digits.slice(2);
  return digits.replace(/^0+/, "");
}

type FormState = {
  name: string;
  company: string;
  phone: string;
  gstNumber: string;
  address: string;
  pinCode: string;
  state: string;
  district: string;
  status: string;
};

function fromOwner(owner: Owner): FormState {
  const address = (owner.address ?? {}) as { line1?: string };
  return {
    name: owner.name ?? "",
    company: owner.company ?? "",
    phone: owner.phone ?? "",
    gstNumber: owner.gstNumber ?? "",
    address: address.line1 ?? "",
    pinCode: owner.pinCode ?? "",
    state: owner.stateId ?? "",
    district: owner.districtId ?? "",
    status: owner.status ?? "",
  };
}

function validate(form: FormState): Partial<Record<keyof FormState, string>> {
  const errors: Partial<Record<keyof FormState, string>> = {};
  if (form.name.trim().length < 2) errors.name = "Enter the owner's full name.";
  if (form.company.trim().length < 2) errors.company = "Enter the company or business name.";
  if (!/^[6-9]\d{9}$/.test(normaliseMobile(form.phone)))
    errors.phone = "Enter a 10-digit Indian mobile number.";
  if (form.address.trim().length < 3) errors.address = "Enter the street address.";
  if (!PIN_RE.test(form.pinCode.trim())) errors.pinCode = "PIN code must be exactly 6 digits.";
  if (!form.state) errors.state = "Select a state.";
  if (!form.district) errors.district = "Select a district.";
  const gst = form.gstNumber.trim().toUpperCase();
  if (gst && !GSTIN_RE.test(gst))
    errors.gstNumber = "GSTIN must be 15 characters, e.g. 29ABCDE1234F1Z5.";
  return errors;
}

function FieldError({ message }: { message?: string | undefined }) {
  if (!message) return null;
  return <p className="text-xs text-destructive">{message}</p>;
}

/**
 * Edit an existing owner. Pre-filled from the owner's current values and
 * submitted as a PATCH; the server re-validates everything (including that the
 * district belongs to the state) and stays the authority.
 */
export function OwnerEditDialog({ owner, trigger }: { owner: Owner; trigger: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<FormState>(() => fromOwner(owner));
  const [touched, setTouched] = useState(false);

  const update = useUpdateOwner(owner.id);
  const states = useLocationStates();
  const districts = useLocationDistricts(form.state || null);

  // Re-seed the form each time the dialog opens so it always reflects the latest
  // values and discards any abandoned edits from a previous open.
  useEffect(() => {
    if (open) {
      setForm(fromOwner(owner));
      setTouched(false);
    }
  }, [open, owner]);

  const errors = validate(form);
  const invalid = Object.keys(errors).length > 0;
  const showError = (key: keyof FormState) => (touched ? errors[key] : undefined);

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));
  const setState = (state: string) => setForm((f) => ({ ...f, state, district: "" }));

  const noStates = !states.isLoading && !states.error && (states.data?.length ?? 0) === 0;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (invalid) return;

    const payload: UpdateOwnerInput = {
      name: form.name.trim(),
      company: form.company.trim(),
      phone: normaliseMobile(form.phone),
      address: form.address.trim(),
      pinCode: form.pinCode.trim(),
      state: form.state,
      district: form.district,
      status: form.status,
      gstNumber: form.gstNumber.trim().toUpperCase() || "",
    };

    try {
      await update.mutateAsync(payload);
      toast.success("Owner updated", { description: `${payload.company} saved.` });
      setOpen(false);
    } catch (err) {
      toast.error("Could not update owner", { description: errorMessage(err) });
    }
  };

  const districtPlaceholder = useMemo(() => {
    if (!form.state) return "Select a state first";
    if (districts.isLoading) return "Loading…";
    return "Select a district";
  }, [form.state, districts.isLoading]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>{trigger}</DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit owner</DialogTitle>
          <DialogDescription>
            Update the owner&apos;s details. Changes are recorded in the audit log.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="edit-name">Full name *</Label>
              <Input id="edit-name" value={form.name} onChange={set("name")} />
              <FieldError message={showError("name")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-company">Company *</Label>
              <Input id="edit-company" value={form.company} onChange={set("company")} />
              <FieldError message={showError("company")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-phone">Mobile *</Label>
              <Input id="edit-phone" inputMode="tel" value={form.phone} onChange={set("phone")} />
              <FieldError message={showError("phone")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-status">Status</Label>
              <Select
                value={form.status}
                onValueChange={(status) => setForm((f) => ({ ...f, status }))}
              >
                <SelectTrigger id="edit-status">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent>
                  {OWNER_STATUSES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s.charAt(0) + s.slice(1).toLowerCase()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="edit-gst">
                GST number <span className="font-normal text-muted-foreground">(Optional)</span>
              </Label>
              <Input
                id="edit-gst"
                placeholder="29ABCDE1234F1Z5"
                value={form.gstNumber}
                onChange={set("gstNumber")}
              />
              <FieldError message={showError("gstNumber")} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="edit-address">Street address *</Label>
              <Input id="edit-address" value={form.address} onChange={set("address")} />
              <FieldError message={showError("address")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-pin">PIN code *</Label>
              <Input
                id="edit-pin"
                inputMode="numeric"
                maxLength={6}
                value={form.pinCode}
                onChange={set("pinCode")}
              />
              <FieldError message={showError("pinCode")} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="edit-state">State *</Label>
              <Select value={form.state} onValueChange={setState}>
                <SelectTrigger id="edit-state" disabled={noStates}>
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
              <FieldError message={showError("state")} />
            </div>
            <div className="space-y-1.5 sm:col-span-2">
              <Label htmlFor="edit-district">District *</Label>
              <Select
                value={form.district}
                onValueChange={(district) => setForm((f) => ({ ...f, district }))}
                disabled={!form.state}
              >
                <SelectTrigger id="edit-district">
                  <SelectValue placeholder={districtPlaceholder} />
                </SelectTrigger>
                <SelectContent>
                  {(districts.data ?? []).map((d) => (
                    <SelectItem key={d.id} value={d.id}>
                      {d.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError message={showError("district")} />
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" disabled={update.isPending || (touched && invalid)}>
              {update.isPending && <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />}
              Save changes
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
