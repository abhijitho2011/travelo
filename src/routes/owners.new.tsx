import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader, Section } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useCreateOwner, type CreateOwnerInput } from "@/hooks/api/use-owners";
import { errorMessage } from "@/lib/api";

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
  email: string;
  phone: string;
  company: string;
  gstNumber: string;
  city: string;
  country: string;
};

const EMPTY: FormState = {
  name: "",
  email: "",
  phone: "",
  company: "",
  gstNumber: "",
  city: "",
  country: "",
};

function NewOwnerPage() {
  const navigate = useNavigate();
  const [form, setForm] = useState<FormState>(EMPTY);
  const [error, setError] = useState<string | null>(null);
  const createOwner = useCreateOwner();

  const set = (key: keyof FormState) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const payload: CreateOwnerInput = { name: form.name.trim(), email: form.email.trim() };
    if (form.phone.trim()) payload.phone = form.phone.trim();
    if (form.company.trim()) payload.company = form.company.trim();
    if (form.gstNumber.trim()) payload.gstNumber = form.gstNumber.trim();
    if (form.city.trim()) payload.city = form.city.trim();
    if (form.country.trim()) payload.country = form.country.trim();

    try {
      const owner = await createOwner.mutateAsync(payload);
      toast.success("Owner created", {
        description: `${owner.company ?? owner.name} starts in Pending until activated.`,
      });
      navigate({ to: "/owners/$ownerId", params: { ownerId: owner.id } });
    } catch (err) {
      const message = errorMessage(err);
      setError(message);
      toast.error("Could not create owner", { description: message });
    }
  };

  return (
    <>
      <PageHeader
        eyebrow="Customers"
        title="New owner"
        description="Create the account first, then attach properties and a subscription."
        breadcrumbs={[{ label: "Owners", to: "/owners" }, { label: "New owner" }]}
      />

      <div className="max-w-3xl p-5 lg:p-6">
        <form onSubmit={submit}>
          <Section title="Owner details" description="Name and email are required.">
            {error && (
              <div
                role="alert"
                className="mx-4 mt-4 rounded-md border border-destructive/25 bg-destructive-soft px-3 py-2 text-sm text-destructive"
              >
                {error}
              </div>
            )}
            <div className="grid gap-4 p-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="owner-name">Primary contact name *</Label>
                <Input id="owner-name" value={form.name} onChange={set("name")} required minLength={2} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="owner-email">Email *</Label>
                <Input
                  id="owner-email"
                  type="email"
                  value={form.email}
                  onChange={set("email")}
                  required
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="owner-company">Company</Label>
                <Input id="owner-company" value={form.company} onChange={set("company")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="owner-phone">Phone</Label>
                <Input id="owner-phone" value={form.phone} onChange={set("phone")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="owner-gst">GST number</Label>
                <Input id="owner-gst" value={form.gstNumber} onChange={set("gstNumber")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="owner-city">City</Label>
                <Input id="owner-city" value={form.city} onChange={set("city")} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="owner-country">Country</Label>
                <Input id="owner-country" value={form.country} onChange={set("country")} />
              </div>
            </div>
          </Section>

          <div className="mt-4 flex items-center justify-end gap-2">
            <Button asChild variant="outline" type="button">
              <Link to="/owners">Cancel</Link>
            </Button>
            <Button type="submit" disabled={createOwner.isPending}>
              {createOwner.isPending && <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />}
              Create owner
            </Button>
          </div>
        </form>
      </div>
    </>
  );
}
