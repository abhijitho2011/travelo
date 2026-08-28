/** Admin users, roles and the permission catalogue. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, type Paginated } from "@/lib/api";
import { qk } from "@/hooks/api/keys";
import { currentAdminKey } from "@/lib/auth";
import type { AdminSession, AdminUser, Permission, Role } from "@/hooks/api/types";

export type AdminUserListParams = {
  limit?: number | undefined;
  offset?: number | undefined;
  q?: string | undefined;
};

export function useAdminUsers(params: AdminUserListParams) {
  return useQuery({
    queryKey: qk.adminUsers.list(params),
    queryFn: () => apiFetch<Paginated<AdminUser>>("/admin-users", { query: params }),
    placeholderData: (previous) => previous,
  });
}

export function useAdminUser(id: string) {
  return useQuery({
    queryKey: qk.adminUsers.detail(id),
    queryFn: () => apiFetch<AdminUser>(`/admin-users/${id}`),
    enabled: !!id,
  });
}

export function useAdminSessions(id: string) {
  return useQuery({
    queryKey: qk.adminUsers.sessions(id),
    queryFn: () => apiFetch<AdminSession[]>(`/admin-users/${id}/sessions`),
    enabled: !!id,
  });
}

export function useCreateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; name: string; password: string; roleKeys?: string[] }) =>
      apiFetch<AdminUser>("/admin-users", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.adminUsers.all }),
  });
}

export function useUpdateAdminUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: { id: string; name?: string; roleKeys?: string[] }) =>
      apiFetch<AdminUser>(`/admin-users/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.adminUsers.all });
      qc.invalidateQueries({ queryKey: currentAdminKey });
    },
  });
}

export function useSetAdminUserStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      status,
      reason,
    }: {
      id: string;
      status: "Active" | "Inactive" | "Blocked";
      reason?: string | undefined;
    }) =>
      apiFetch<AdminUser>(`/admin-users/${id}/status`, {
        method: "PATCH",
        body: { status, reason },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.adminUsers.all });
      qc.invalidateQueries({ queryKey: qk.audit.all });
    },
  });
}

export function useRevokeAdminSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ adminId, sessionId }: { adminId: string; sessionId: string }) =>
      apiFetch(`/admin-users/${adminId}/sessions/${sessionId}`, { method: "DELETE" }),
    onSuccess: (_data, vars) =>
      qc.invalidateQueries({ queryKey: qk.adminUsers.sessions(vars.adminId) }),
  });
}

/* -------------------------------------------------------------------- roles */

export function useRoles() {
  return useQuery({
    queryKey: qk.roles.list,
    queryFn: () => apiFetch<Role[]>("/roles"),
  });
}

export function useRole(id: string) {
  return useQuery({
    queryKey: qk.roles.detail(id),
    queryFn: () => apiFetch<Role>(`/roles/${id}`),
    enabled: !!id,
  });
}

export function usePermissions() {
  return useQuery({
    queryKey: qk.permissions,
    queryFn: () => apiFetch<Permission[]>("/permissions"),
    staleTime: 10 * 60 * 1000,
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      key: string;
      name: string;
      description?: string;
      permissions?: string[];
    }) => apiFetch<Role>("/roles", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.roles.all }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      id,
      ...input
    }: {
      id: string;
      name?: string | undefined;
      description?: string | undefined;
      permissions?: string[] | undefined;
    }) => apiFetch<Role>(`/roles/${id}`, { method: "PATCH", body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.roles.all });
      qc.invalidateQueries({ queryKey: qk.adminUsers.all });
      qc.invalidateQueries({ queryKey: currentAdminKey });
    },
  });
}
