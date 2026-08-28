import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { PageHeader, Section, StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adminUsers, permissionMatrix, roles } from "@/lib/travelo-data";

export const Route = createFileRoute("/roles")({
  head: () => ({
    meta: [
      { title: "Roles & Permissions · Travelo Super Admin" },
      { name: "description", content: "Granular role-based access control for Travelo administrators across owners, billing, support and platform settings." },
      { property: "og:title", content: "Roles & Permissions · Travelo Super Admin" },
      { property: "og:description", content: "RBAC configuration for the Travelo control plane." },
    ],
  }),
  component: RolesPage,
});

const defaults: Record<string, string[]> = {
  "Super Admin": ["*"],
  "Platform Admin": ["Owners:View", "Owners:Create", "Owners:Edit", "Subscriptions:View", "Subscriptions:Edit", "Platform:View", "Platform:Configure"],
  "Finance Admin": ["Billing:View", "Billing:Refund", "Billing:Export", "Subscriptions:View", "Owners:View"],
  "Support Admin": ["Support:View", "Support:Reply", "Support:Assign", "Support:Resolve", "Owners:View", "Platform:Impersonate"],
  "Operations Admin": ["Owners:View", "Subscriptions:View", "Platform:View"],
  "Technical Admin": ["Platform:View", "Platform:Configure", "Support:View", "Support:Reply"],
  Auditor: ["Audit:View", "Audit:Export", "Owners:View", "Billing:View"],
};

function RolesPage() {
  const [role, setRole] = useState("Support Admin");
  const granted = defaults[role] ?? [];
  const all = granted.includes("*");

  return (
    <>
      <PageHeader
        eyebrow="Security"
        title="Roles & Permissions"
        description="Least-privilege access control. Every permission change is written to the audit log."
        breadcrumbs={[{ label: "Super Admin", to: "/" }, { label: "Roles & Permissions" }]}
        actions={
          <Button size="sm" className="h-8" onClick={() => toast.success(`Permissions saved for ${role}`)}>
            Save changes
          </Button>
        }
      />
      <div className="grid gap-4 p-4 lg:grid-cols-4 lg:p-6">
        <Section title="Roles" description="Select a role to edit its permissions">
          <ul className="divide-y divide-border">
            {roles.map((r) => {
              const count = adminUsers.filter((a) => a.role === r).length;
              return (
                <li key={r}>
                  <button
                    onClick={() => setRole(r)}
                    aria-current={role === r}
                    className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm transition-colors hover:bg-surface-muted ${role === r ? "bg-surface-muted font-semibold" : ""}`}
                  >
                    <span>{r}</span>
                    <span className="tnum text-xs text-muted-foreground">{count}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </Section>

        <div className="space-y-4 lg:col-span-3">
          <Section
            title={`${role} permissions`}
            description={all ? "Unrestricted access to every capability" : `${granted.length} permissions granted`}
            actions={<StatusBadge status={all ? "Critical" : "Active"} />}
          >
            <div className="divide-y divide-border">
              {permissionMatrix.map((group) => (
                <fieldset key={group.group} className="px-4 py-3">
                  <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">{group.group}</legend>
                  <div className="flex flex-wrap gap-2">
                    {group.actions.map((action) => {
                      const key = `${group.group}:${action}`;
                      return (
                        <label key={key} className="flex items-center gap-2 rounded-md border border-border px-2.5 py-1.5 text-sm">
                          <Checkbox
                            defaultChecked={all || granted.includes(key)}
                            onCheckedChange={(v) => toast.success(`${key} ${v ? "granted" : "revoked"} for ${role}`)}
                          />
                          {action}
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
              ))}
            </div>
          </Section>

          <Section title="Assigned administrators" description={`Team members currently holding the ${role} role`}>
            <ul className="divide-y divide-border">
              {adminUsers.filter((a) => a.role === role).length === 0 ? (
                <li className="px-4 py-4 text-sm text-muted-foreground">No administrators hold this role.</li>
              ) : (
                adminUsers.filter((a) => a.role === role).map((a) => (
                  <li key={a.email} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm">
                    <span>
                      <span className="block font-medium">{a.name}</span>
                      <span className="block text-xs text-muted-foreground">{a.email}</span>
                    </span>
                    <span className="flex items-center gap-2">
                      <StatusBadge status={a.status} />
                      <Select defaultValue={a.role} onValueChange={(v) => toast.success(`${a.name} moved to ${v}`)}>
                        <SelectTrigger className="h-7 w-[160px] text-xs" aria-label={`Change role for ${a.name}`}>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {roles.map((r) => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                        </SelectContent>
                      </Select>
                    </span>
                  </li>
                ))
              )}
            </ul>
          </Section>
        </div>
      </div>
    </>
  );
}
