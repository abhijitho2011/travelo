import { createFileRoute } from "@tanstack/react-router";

import { AsyncSection, PageHeader, StatusBadge } from "@/components/admin/primitives";
import { usePermissions, useRoles } from "@/hooks/api/use-access";
import { humanise } from "@/lib/format";

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
  const groups = permissions.reduce<Record<string, string[]>>((acc, permission) => {
    const group = permission.group || "other";
    (acc[group] ??= []).push(permission.key);
    return acc;
  }, {});

  return (
    <div className="space-y-5">
      <PageHeader
        title="Roles & permissions"
        description="Permissions are enforced by the backend on every request — the UI only reflects them."
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
