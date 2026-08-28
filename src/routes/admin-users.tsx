import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable, type Column } from "@/components/admin/data-table";
import { PageHeader, StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { AdminUser } from "@/hooks/api/types";
import { useAdminUsers, useSetAdminUserStatus } from "@/hooks/api/use-access";
import { errorMessage } from "@/lib/api";
import { formatDateTime, humanise } from "@/lib/format";

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
    </div>
  );
}
