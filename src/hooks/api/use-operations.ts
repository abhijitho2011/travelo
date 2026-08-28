/** Impersonation, announcements, notifications, integrations, jobs and audit logs. */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, toPaginated, type Paginated } from "@/lib/api";
import { qk } from "@/hooks/api/keys";
import type {
  AdminNotification,
  Announcement,
  AuditLog,
  BackgroundJob,
  ImpersonationSession,
  IntegrationConnection,
  NotificationTemplate,
} from "@/hooks/api/types";

/* ------------------------------------------------------------ impersonation */

export type ImpersonationHistoryParams = {
  limit?: number | undefined;
  offset?: number | undefined;
  actorAdminId?: string | undefined;
};

export function useImpersonationHistory(params: ImpersonationHistoryParams) {
  const limit = params.limit ?? 25;
  const offset = params.offset ?? 0;
  return useQuery({
    queryKey: qk.impersonation.history(params),
    queryFn: async () => {
      const raw = await apiFetch<ImpersonationSession[] | Paginated<ImpersonationSession>>(
        "/impersonation/history",
        { query: params },
      );
      return toPaginated(raw, limit, offset);
    },
    placeholderData: (previous) => previous,
  });
}

export function useStartImpersonation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      targetUserType: "OWNER" | "GM" | "AGM";
      targetUserId?: string | undefined;
      targetOwnerId?: string | undefined;
      targetPropertyId?: string | undefined;
      reason: string;
    }) =>
      apiFetch<{ session: ImpersonationSession; token: string; expiresInSeconds: number }>(
        "/impersonation",
        { method: "POST", body: input },
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.impersonation.all });
      qc.invalidateQueries({ queryKey: qk.audit.all });
    },
  });
}

export function useTerminateImpersonation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<ImpersonationSession>(`/impersonation/${id}/terminate`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.impersonation.all });
      qc.invalidateQueries({ queryKey: qk.audit.all });
    },
  });
}

/* ------------------------------------------------------------ announcements */

export type AnnouncementListParams = {
  limit?: number | undefined;
  offset?: number | undefined;
  status?: string | undefined;
};

export function useAnnouncements(params: AnnouncementListParams) {
  const limit = params.limit ?? 25;
  const offset = params.offset ?? 0;
  return useQuery({
    queryKey: qk.announcements.list(params),
    queryFn: async () => {
      const raw = await apiFetch<Announcement[] | Paginated<Announcement>>("/announcements", {
        query: params,
      });
      return toPaginated(raw, limit, offset);
    },
    placeholderData: (previous) => previous,
  });
}

export type CreateAnnouncementInput = {
  title: string;
  message: string;
  audience: Record<string, unknown>;
  channels?: string[] | undefined;
  priority?: string | undefined;
  scheduledAt?: string | undefined;
  expiresAt?: string | undefined;
  status?: string | undefined;
};

export function useCreateAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateAnnouncementInput) =>
      apiFetch<Announcement>("/announcements", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.announcements.all }),
  });
}

export function usePublishAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<Announcement>(`/announcements/${id}/publish`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.announcements.all }),
  });
}

export function useDeleteAnnouncement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/announcements/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.announcements.all }),
  });
}

/* ------------------------------------------------------------ notifications */

export type NotificationListParams = {
  limit?: number | undefined;
  offset?: number | undefined;
  unread?: boolean | undefined;
};

export type NotificationPage = Paginated<AdminNotification> & { unread: number };

export function useNotifications(params: NotificationListParams) {
  return useQuery({
    queryKey: qk.notifications.list(params),
    queryFn: () => apiFetch<NotificationPage>("/notifications", { query: params }),
    placeholderData: (previous) => previous,
  });
}

export function useMarkNotificationRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch(`/notifications/${id}/read`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications.all }),
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch("/notifications/read-all", { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications.all }),
  });
}

export function useNotificationTemplates() {
  return useQuery({
    queryKey: qk.notifications.templates,
    queryFn: () => apiFetch<NotificationTemplate[]>("/notifications/templates"),
  });
}

export function useUpsertNotificationTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: {
      templateKey: string;
      name: string;
      channel: string;
      subject?: string | undefined;
      body: string;
      status?: string | undefined;
    }) =>
      apiFetch<NotificationTemplate>("/notifications/templates", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.notifications.templates }),
  });
}

/* ------------------------------------------------------------- integrations */

export type IntegrationListParams = {
  limit?: number | undefined;
  offset?: number | undefined;
  status?: string | undefined;
  ownerId?: string | undefined;
};

export function useIntegrations(params: IntegrationListParams) {
  const limit = params.limit ?? 25;
  const offset = params.offset ?? 0;
  return useQuery({
    queryKey: qk.integrations.list(params),
    queryFn: async () => {
      const raw = await apiFetch<IntegrationConnection[] | Paginated<IntegrationConnection>>(
        "/integrations",
        { query: params },
      );
      return toPaginated(raw, limit, offset);
    },
    placeholderData: (previous) => previous,
  });
}

/* --------------------------------------------------------------------- jobs */

export type JobListParams = {
  limit?: number | undefined;
  offset?: number | undefined;
  state?: string | undefined;
  queue?: string | undefined;
};

export function useJobs(params: JobListParams) {
  const limit = params.limit ?? 25;
  const offset = params.offset ?? 0;
  return useQuery({
    queryKey: qk.jobs.list(params),
    queryFn: async () => {
      const raw = await apiFetch<BackgroundJob[] | Paginated<BackgroundJob>>("/jobs", {
        query: params,
      });
      return toPaginated(raw, limit, offset);
    },
    placeholderData: (previous) => previous,
    refetchInterval: 30_000,
  });
}

export function useRetryJob() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => apiFetch<BackgroundJob>(`/jobs/${id}/retry`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.jobs.all }),
  });
}

/* --------------------------------------------------------------- audit logs */

export type AuditListParams = {
  limit?: number | undefined;
  offset?: number | undefined;
  actorId?: string | undefined;
  entity?: string | undefined;
  entityId?: string | undefined;
};

export function useAuditLogs(params: AuditListParams) {
  return useQuery({
    queryKey: qk.audit.list(params),
    queryFn: () => apiFetch<Paginated<AuditLog>>("/audit-logs", { query: params }),
    placeholderData: (previous) => previous,
  });
}
