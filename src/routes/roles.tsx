import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AsyncSection, PageHeader, StatusBadge } from "@/components/admin/primitives";
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
import type { Permission, Role } from "@/hooks/api/types";
import {
  useCreateRole,
  usePermissions,
  useRoles,
  useUpdateRole,
} from "@/hooks/api/use-access";
import { errorMessage } from "@/lib/api";
import { humanise } from "@/lib/format";

function groupPermissions(permissions: Permission[]) {
  return permissions.reduce<Record<string, string[]>>((acc, permission) => {
    const group = permission.group || "other";
    (acc[group] ??= []).push(permission.key);
    return acc;
  }, {});
}

/** Create (no role) or edit (role passed) a role and its permission set. */
function RoleEditorDialog({ role, permissions }: { role?: Role; permissions: Permission[] }) {
  const editing = !!role;
  const [open, setOpen] = useState(false);
  const [key, setKey] = useState(role?.key ?? "");
  const [name, setName] = useState(role?.name ?? "");
  const [description, setDescription] = useState(role?.description ?? "");
  const [selected, setSelected] = useState<string[]>(role?.permissions ?? []);
  const create = useCreateRole();
  const update = useUpdateRole();
  const busy = create.isPending || update.isPending;

  const groups = groupPermissions(permissions);
  const wildcard = selected.includes("*");

  const openDialog = () => {
    setKey(role?.key ?? "");
    setName(role?.name ?? "");
    setDescription(role?.description ?? "");
    setSelected(role?.permissions ?? []);
    setOpen(true);
  };

  const toggle = (permKey: string) =>
    setSelected((cur) =>
      cur.includes(permKey) ? cur.filter((k) => k !== permKey) : [...cur, permKey],
    );

  const invalid = !editing && (key.trim().length < 2 || name.trim().length < 2);

  const submit = async () => {
    try {
      if (editing) {
        await update.mutateAsync({
          id: role.id,
          name: name.trim(),
          description: description.trim() || undefined,
          permissions: selected,
        });
      } else {
        const trimmedDescription = description.trim();
        await create.mutateAsync({
          key: key.trim(),
          name: name.trim(),
          permissions: selected,
          ...(trimmedDescription ? { description: trimmedDescription } : {}),
        });
      }
      toast.success(editing ? "Role updated" : "Role created", { description: name.trim() });
      setOpen(false);
    } catch (error) {
      toast.error("Could not save role", { description: errorMessage(error) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {editing ? (
          <Button variant="outline" size="sm" className="h-7 text-xs" onClick={openDialog}>
            Edit
          </Button>
        ) : (
          <Button size="sm" className="h-8" onClick={openDialog}>
            <Plus aria-hidden className="mr-1.5 size-3.5" /> New role
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${role.name}` : "New role"}</DialogTitle>
          <DialogDescription>
            Permissions are enforced by the backend on every request.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="role-key">Key</Label>
              <Input
                id="role-key"
                value={key}
                disabled={editing}
                onChange={(e) => setKey(e.target.value)}
                placeholder="regional_manager"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="role-name">Name</Label>
              <Input id="role-name" value={name} onChange={(e) => setName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="role-desc">Description</Label>
            <Textarea
              id="role-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
            />
          </div>
          {wildcard ? (
            <p className="rounded-md border border-success/25 bg-success-soft px-3 py-2 text-sm text-success">
              This role holds the <code>*</code> wildcard — every permission. Remove it below to
              scope the role.
            </p>
          ) : null}
          <fieldset className="space-y-3">
            <legend className="text-sm font-semibold">Permissions</legend>
            {Object.entries(groups).map(([group, keys]) => (
              <div key={group}>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {humanise(group)}
                </h3>
                <div className="mt-1.5 grid gap-1 sm:grid-cols-2">
                  {keys.map((permKey) => (
                    <label key={permKey} className="flex items-center gap-2 text-xs">
                      <input
                        type="checkbox"
                        checked={selected.includes(permKey)}
                        onChange={() => toggle(permKey)}
                      />
                      <code className="text-muted-foreground">{permKey}</code>
                    </label>
                  ))}
                </div>
              </div>
            ))}
          </fieldset>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={invalid || busy} onClick={() => void submit()}>
            {busy && <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />}
            {editing ? "Save changes" : "Create role"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const Route = createFileRoute("/roles")({
  head: () => ({
    meta: [
      { title: "Roles & permissions · Tavelo Super Admin" },
      {
        name: "description",
        content: "Role definitions and the permissions granted to each administrator role.",
      },
    ],
  }),
  component: RolesPage,
});

function RolesPage() {
  const rolesQuery = useRoles();
  const permissionsQuery = usePermissions();

  const roles = rolesQuery.data ?? [];
  const permissions = permissionsQuery.data ?? [];

  // Group permissions so the matrix reads by domain rather than as a flat list.
  const groups = groupPermissions(permissions);

  return (
    <div className="space-y-5">
      <PageHeader
        title="Roles & permissions"
        description="Permissions are enforced by the backend on every request — the UI only reflects them."
        actions={<RoleEditorDialog permissions={permissions} />}
      />

      <AsyncSection
        loading={rolesQuery.isLoading}
        error={rolesQuery.error}
        onRetry={() => void rolesQuery.refetch()}
        isEmpty={roles.length === 0}
        emptyTitle="No roles defined"
        emptyDescription="Roles will appear here once the platform is seeded."
      >
        <div className="space-y-3">
          {roles.map((role) => (
            <div key={role.id} className="panel p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="font-medium text-foreground">{role.name}</span>
                <code className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground">
                  {role.key}
                </code>
                {role.isSystem && <StatusBadge status="System" tone="info" />}
                {typeof role.adminCount === "number" && (
                  <span className="text-xs text-muted-foreground">
                    {role.adminCount} admin{role.adminCount === 1 ? "" : "s"}
                  </span>
                )}
                {!role.isSystem && (
                  <span className="ml-auto">
                    <RoleEditorDialog role={role} permissions={permissions} />
                  </span>
                )}
              </div>

              {role.description && (
                <p className="mt-1 text-sm text-muted-foreground">{role.description}</p>
              )}

              <div className="mt-3 flex flex-wrap gap-1.5">
                {role.permissions.includes("*") ? (
                  <StatusBadge status="All permissions" tone="success" />
                ) : (
                  role.permissions.map((key) => (
                    <code
                      key={key}
                      className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
                    >
                      {key}
                    </code>
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      </AsyncSection>

      <AsyncSection
        loading={permissionsQuery.isLoading}
        error={permissionsQuery.error}
        onRetry={() => void permissionsQuery.refetch()}
        isEmpty={permissions.length === 0}
        emptyTitle="No permission catalogue"
        emptyDescription="The permission catalogue is published by the backend."
      >
        <div className="panel p-4">
          <h2 className="text-sm font-medium text-foreground">Permission catalogue</h2>
          <div className="mt-3 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {Object.entries(groups).map(([group, keys]) => (
              <div key={group}>
                <h3 className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {humanise(group)}
                </h3>
                <ul className="mt-1.5 space-y-1">
                  {keys.map((key) => (
                    <li key={key} className="text-xs text-muted-foreground">
                      {key}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      </AsyncSection>
    </div>
  );
}
