import { createFileRoute } from "@tanstack/react-router";
import { toast } from "sonner";

import { DataTable, type Column } from "@/components/admin/data-table";
import { PageHeader, Section, StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Textarea } from "@/components/ui/textarea";
import { notificationTemplates } from "@/lib/travelo-data";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Platform Settings · Travelo Super Admin" },
      { name: "description", content: "Configure Travelo platform defaults: branding, localisation, tax, notification templates, security policy and feature flags." },
      { property: "og:title", content: "Platform Settings · Travelo Super Admin" },
      { property: "og:description", content: "Global configuration for the Travelo platform." },
    ],
  }),
  component: SettingsPage,
});

type Template = (typeof notificationTemplates)[number];

const flags = [
  { name: "Kitchen & F&B module", detail: "Recipe costing and KOT routing", on: true },
  { name: "Digital key-card issuing", detail: "Onity / Salto integrations", on: true },
  { name: "Dynamic pricing engine", detail: "Beta — 12 properties enrolled", on: false },
  { name: "WhatsApp guest messaging", detail: "Requires template approval", on: true },
  { name: "Owner mobile app v2", detail: "Staged rollout to Enterprise", on: false },
];

function SettingsPage() {
  const templateColumns: Column<Template>[] = [
    { key: "name", header: "Template", sortValue: (t) => t.name, cell: (t) => <span className="font-semibold">{t.name}</span> },
    { key: "channel", header: "Channels", cell: (t) => <span className="text-muted-foreground">{t.channel}</span> },
    { key: "body", header: "Preview", optional: true, cell: (t) => <span className="line-clamp-1 text-muted-foreground">{t.body}</span> },
    { key: "updated", header: "Updated", cell: (t) => <span className="tnum text-muted-foreground">{t.updated}</span> },
    { key: "status", header: "Status", cell: (t) => <StatusBadge status={t.status} /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Configuration"
        title="Platform Settings"
        description="Global defaults applied across every owner workspace. Changes are versioned and audited."
        breadcrumbs={[{ label: "Super Admin", to: "/" }, { label: "Settings" }]}
        actions={
          <Button size="sm" className="h-8" onClick={() => toast.success("Platform settings saved")}>
            Save changes
          </Button>
        }
      />
      <div className="p-4 lg:p-6">
        <Tabs defaultValue="general">
          <TabsList className="flex-wrap">
            <TabsTrigger value="general">General</TabsTrigger>
            <TabsTrigger value="billing">Billing & tax</TabsTrigger>
            <TabsTrigger value="templates">Notification templates</TabsTrigger>
            <TabsTrigger value="security">Security policy</TabsTrigger>
            <TabsTrigger value="flags">Feature flags</TabsTrigger>
          </TabsList>

          <TabsContent value="general" className="mt-4 grid gap-4 lg:grid-cols-2">
            <Section title="Brand & identity" description="Displayed on owner workspaces, invoices and emails">
              <div className="space-y-3 p-4">
                <Field id="brand-name" label="Platform name" defaultValue="Travelo" />
                <Field id="brand-support" label="Support email" defaultValue="support@travelo.io" />
                <Field id="brand-url" label="Marketing site" defaultValue="https://travelo.io" />
                <div className="space-y-1.5">
                  <Label htmlFor="brand-footer">Email footer</Label>
                  <Textarea id="brand-footer" rows={3} defaultValue="Travelo Hospitality Technologies Pvt Ltd, Kochi, India" />
                </div>
              </div>
            </Section>
            <Section title="Localisation" description="Defaults for new owner accounts">
              <div className="space-y-3 p-4">
                <Choice id="loc-currency" label="Default currency" value="INR (₹)" options={["INR (₹)", "AED (د.إ)", "USD ($)"]} />
                <Choice id="loc-tz" label="Default timezone" value="Asia/Kolkata" options={["Asia/Kolkata", "Asia/Dubai", "UTC"]} />
                <Choice id="loc-lang" label="Default language" value="English" options={["English", "Hindi", "Arabic"]} />
                <Choice id="loc-date" label="Date format" value="DD MMM YYYY" options={["DD MMM YYYY", "MM/DD/YYYY", "YYYY-MM-DD"]} />
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="billing" className="mt-4 grid gap-4 lg:grid-cols-2">
            <Section title="Tax & compliance" description="Applied to generated invoices">
              <div className="space-y-3 p-4">
                <Field id="tax-gstin" label="Platform GSTIN" defaultValue="32AABCT1332L1ZV" />
                <Field id="tax-rate" label="Default GST rate (%)" defaultValue="18" />
                <Field id="tax-prefix" label="Invoice number prefix" defaultValue="TRV-INV-" />
                <Toggle id="tax-reverse" label="Enable reverse charge for UAE" detail="Zero-rated exports to GCC entities" />
              </div>
            </Section>
            <Section title="Dunning & grace" description="What happens when a payment fails">
              <div className="space-y-3 p-4">
                <Choice id="dun-retries" label="Automatic retries" value="3 attempts" options={["1 attempt", "3 attempts", "5 attempts"]} />
                <Choice id="dun-grace" label="Grace period" value="7 days" options={["3 days", "7 days", "14 days"]} />
                <Toggle id="dun-suspend" label="Auto-suspend after grace period" detail="Owner keeps read-only access to reservations" defaultChecked />
                <Toggle id="dun-notify" label="Notify account manager" detail="Slack alert on every failed payment" defaultChecked />
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="templates" className="mt-4">
            <DataTable
              rows={notificationTemplates}
              columns={templateColumns}
              rowKey={(t) => t.name}
              searchKeys={(t) => `${t.name} ${t.channel}`}
              searchPlaceholder="Search template…"
              exportName="NotificationTemplates"
              onRowClick={(t) => toast.info(`Editing "${t.name}"`)}
              emptyTitle="No templates"
              emptyDescription="Create your first notification template."
            />
          </TabsContent>

          <TabsContent value="security" className="mt-4 grid gap-4 lg:grid-cols-2">
            <Section title="Authentication policy" description="Applies to Travelo administrators">
              <div className="space-y-3 p-4">
                <Toggle id="sec-mfa" label="Mandatory MFA" detail="All admin roles must enrol an authenticator" defaultChecked />
                <Choice id="sec-session" label="Session timeout" value="30 minutes" options={["15 minutes", "30 minutes", "60 minutes"]} />
                <Choice id="sec-password" label="Password rotation" value="90 days" options={["60 days", "90 days", "180 days"]} />
                <Field id="sec-ip" label="IP allowlist (CIDR, comma separated)" defaultValue="103.21.44.0/24, 49.37.120.0/24" />
              </div>
            </Section>
            <Section title="Impersonation policy" description="Guard rails for support access">
              <div className="space-y-3 p-4">
                <Toggle id="sec-reason" label="Reason required" detail="Blocks sessions without a written justification" defaultChecked />
                <Toggle id="sec-approval" label="Approval for read-write sessions" detail="Second admin must approve" defaultChecked />
                <Choice id="sec-limit" label="Maximum session length" value="30 minutes" options={["15 minutes", "30 minutes", "60 minutes"]} />
                <Toggle id="sec-mask" label="Mask guest payment data" detail="Card and payout details always hidden" defaultChecked />
              </div>
            </Section>
          </TabsContent>

          <TabsContent value="flags" className="mt-4">
            <Section title="Feature flags" description="Enable modules platform-wide or for staged rollouts">
              <ul className="divide-y divide-border">
                {flags.map((f) => (
                  <li key={f.name} className="flex flex-wrap items-center justify-between gap-3 px-4 py-3">
                    <span>
                      <span className="block text-sm font-semibold text-foreground">{f.name}</span>
                      <span className="block text-xs text-muted-foreground">{f.detail}</span>
                    </span>
                    <Switch
                      defaultChecked={f.on}
                      aria-label={f.name}
                      onCheckedChange={(v) => toast.success(`${f.name} ${v ? "enabled" : "disabled"}`)}
                    />
                  </li>
                ))}
              </ul>
            </Section>
          </TabsContent>
        </Tabs>
      </div>
    </>
  );
}

function Field({ id, label, defaultValue }: { id: string; label: string; defaultValue: string }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Input id={id} defaultValue={defaultValue} className="h-9" />
    </div>
  );
}

function Choice({ id, label, value, options }: { id: string; label: string; value: string; options: string[] }) {
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      <Select defaultValue={value}>
        <SelectTrigger id={id} className="h-9 text-sm"><SelectValue /></SelectTrigger>
        <SelectContent>
          {options.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}
        </SelectContent>
      </Select>
    </div>
  );
}

function Toggle({ id, label, detail, defaultChecked }: { id: string; label: string; detail: string; defaultChecked?: boolean }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
      <span>
        <span className="block text-sm font-medium text-foreground">{label}</span>
        <span className="block text-xs text-muted-foreground">{detail}</span>
      </span>
      <Switch id={id} defaultChecked={defaultChecked ?? false} aria-label={label} />
    </div>
  );
}
