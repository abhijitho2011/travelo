import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable, type Column } from "@/components/admin/data-table";
import { PageHeader, StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { AdminUser } from "@/hooks/api/types";
import {
  useAdminUsers,
  useCreateAdminUser,
  useSetAdminUserStatus,
  useAdminSessions,
  useRevokeAdminSession,
  useRoles,
  useUpdateAdminUser,
} from "@/hooks/api/use-access";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { errorMessage } from "@/lib/api";
import { formatDateTime, humanise, relativeTime } from "@/lib/format";

/** Create (no admin) or edit (admin passed) an internal administrator. */
function AdminEditorDialog({ admin }: { admin?: AdminUser }) {
  const editing = !!admin;
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState(admin?.email ?? "");
  const [name, setName] = useState(admin?.name ?? "");
  const [password, setPassword] = useState("");
  const [roleKeys, setRoleKeys] = useState<string[]>(admin?.roles.map((r) => r.key) ?? []);

  const roles = useRoles();
  const create = useCreateAdminUser();
  const update = useUpdateAdminUser();
  const busy = create.isPending || update.isPending;

  const openDialog = () => {
    setEmail(admin?.email ?? "");
    setName(admin?.name ?? "");
    setPassword("");
    setRoleKeys(admin?.roles.map((r) => r.key) ?? []);
    setOpen(true);
  };

  const toggleRole = (key: string) =>
    setRoleKeys((cur) => (cur.includes(key) ? cur.filter((k) => k !== key) : [...cur, key]));

  const invalid = editing
    ? name.trim().length < 2
    : name.trim().length < 2 || !email.includes("@") || password.length < 8;

  const submit = async () => {
    try {
      if (editing) {
        await update.mutateAsync({ id: admin.id, name: name.trim(), roleKeys });
      } else {
        await create.mutateAsync({
          email: email.trim(),
          name: name.trim(),
          password,
          roleKeys,
        });
      }
      toast.success(editing ? "Admin updated" : "Admin created", { description: name.trim() });
      setOpen(false);
    } catch (error) {
      toast.error("Could not save admin", { description: errorMessage(error) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        {editing ? (
          <Button size="sm" variant="ghost" onClick={openDialog}>
            Edit
          </Button>
        ) : (
          <Button size="sm" className="h-8" onClick={openDialog}>
            <Plus aria-hidden className="mr-1.5 size-3.5" /> New admin
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{editing ? `Edit ${admin.name}` : "New admin"}</DialogTitle>
          <DialogDescription>
            {editing
              ? "Update the display name and assigned roles."
              : "Create an internal administrator with an initial password and roles."}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="admin-email">Email</Label>
            <Input
              id="admin-email"
              type="email"
              value={email}
              disabled={editing}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="admin-name">Name</Label>
            <Input id="admin-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          {!editing && (
            <div className="space-y-1.5">
              <Label htmlFor="admin-password">Initial password</Label>
              <Input
                id="admin-password"
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
            </div>
          )}
          <fieldset className="space-y-1.5">
            <legend className="text-sm font-medium">Roles</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {(roles.data ?? []).map((role) => (
                <label key={role.key} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={roleKeys.includes(role.key)}
                    onChange={() => toggleRole(role.key)}
                  />
                  {role.name}
                </label>
              ))}
            </div>
          </fieldset>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={busy}>
            Cancel
          </Button>
          <Button disabled={invalid || busy} onClick={() => void submit()}>
            {busy && <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />}
            {editing ? "Save changes" : "Create admin"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const Route = createFileRoute("/admin-users")({
  head: () => ({
    meta: [
      { title: "Admin users · Tavelo Super Admin" },
      { name: "description", content: "Internal Tavelo administrators and their access levels." },
    ],
  }),
  component: AdminUsersPage,
});

const LIMIT = 25;

function AdminUsersPage() {
  const [q, setQ] = useState("");
  const [offset, setOffset] = useState(0);

  const query = useAdminUsers({ limit: LIMIT, offset, q: q.trim() || undefined });
  const setStatus = useSetAdminUserStatus();
  const [sessionsFor, setSessionsFor] = useState<{ id: string; name: string } | null>(null);
  const page = query.data;

  const act = (id: string, status: "Active" | "Blocked") =>
    setStatus.mutate(
      { id, status },
      {
        onSuccess: () => toast.success(`Admin set to ${status}`),
        onError: (error) => toast.error(errorMessage(error)),
      },
    );

  const columns: Column<AdminUser>[] = [
    {
      key: "name",
      header: "Administrator",
      cell: (row) => (
        <div className="min-w-0">
          <div className="truncate font-medium text-foreground">{row.name}</div>
          <div className="truncate text-xs text-muted-foreground">{row.email}</div>
        </div>
      ),
    },
    {
      key: "role",
      header: "Roles",
      cell: (row) => (
        <div className="flex flex-wrap gap-1">
          {row.roles.length > 0 ? (
            row.roles.map((role) => (
              <code
                key={role.key}
                className="rounded bg-muted px-1.5 py-0.5 text-xs text-muted-foreground"
              >
                {role.name}
              </code>
            ))
          ) : (
            <span className="text-muted-foreground">{humanise(row.role)}</span>
          )}
        </div>
      ),
    },
    { key: "status", header: "Status", cell: (row) => <StatusBadge status={row.status} /> },
    {
      key: "lastLogin",
      header: "Last sign-in",
      cell: (row) => (
        <div className="min-w-0">
          <div className="whitespace-nowrap text-muted-foreground">
            {formatDateTime(row.lastLogin)}
          </div>
          {row.lastLoginIp && (
            <div className="truncate text-xs text-muted-foreground">{row.lastLoginIp}</div>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        title="Admin users"
        description="Internal Tavelo staff. Every change to access is written to the audit log."
        actions={<AdminEditorDialog />}
      />

      <DataTable
        rows={page?.items ?? []}
        columns={columns}
        rowKey={(row) => row.id}
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        emptyTitle="No administrators"
        emptyDescription="Admin accounts appear here once created."
        rowActions={(row) => (
          <div className="flex gap-1.5">
            <AdminEditorDialog admin={row} />
            {row.status === "ACTIVE" ? (
              <Button
                size="sm"
                variant="outline"
                disabled={setStatus.isPending}
                onClick={() => act(row.id, "Blocked")}
              >
                Block
              </Button>
            ) : (
              <Button
                size="sm"
                variant="outline"
                disabled={setStatus.isPending}
                onClick={() => act(row.id, "Active")}
              >
                Activate
              </Button>
            )}
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setSessionsFor({ id: row.id, name: row.name })}
            >
              Sessions
            </Button>
          </div>
        )}
        toolbar={
          <Input
            value={q}
            onChange={(event) => {
              setQ(event.target.value);
              setOffset(0);
            }}
            placeholder="Search administrators"
            className="h-8 max-w-xs"
          />
        }
        pagination={{ total: page?.total ?? 0, limit: LIMIT, offset, onOffsetChange: setOffset }}
      />
      <AdminSessionsDialog admin={sessionsFor} onClose={() => setSessionsFor(null)} />
    </div>
  );
}

function AdminSessionsDialog({
  admin,
  onClose,
}: {
  admin: { id: string; name: string } | null;
  onClose: () => void;
}) {
  const query = useAdminSessions(admin?.id ?? "");
  const revoke = useRevokeAdminSession();
  const sessions = (query.data ?? []).filter((sn) => !sn.revokedAt);

  return (
    <Dialog open={!!admin} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Active sessions — {admin?.name}</DialogTitle>
        </DialogHeader>
        {query.isLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : sessions.length === 0 ? (
          <p className="text-sm text-muted-foreground">No active sessions.</p>
        ) : (
          <div className="space-y-2">
            {sessions.map((sn) => (
              <div
                key={sn.id}
                className="flex items-center gap-3 rounded-md border border-border p-2 text-sm"
              >
                <div className="min-w-0 flex-1">
                  <div className="truncate text-foreground">{sn.userAgent ?? "Unknown device"}</div>
                  <div className="text-xs text-muted-foreground">
                    {sn.ip ?? "—"} · started {relativeTime(sn.createdAt)}
                  </div>
                </div>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={revoke.isPending || !admin}
                  onClick={() =>
                    admin &&
                    revoke.mutate(
                      { adminId: admin.id, sessionId: sn.id },
                      {
                        onSuccess: () => toast.success("Session revoked"),
                        onError: (e) => toast.error(errorMessage(e)),
                      },
                    )
                  }
                >
                  Revoke
                </Button>
              </div>
            ))}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
