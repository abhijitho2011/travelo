import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, type Paginated } from "@/lib/api";
import { qk } from "@/hooks/api/keys";
import type { SupportMessage, Ticket, TicketDetail } from "@/hooks/api/types";

export type TicketListParams = {
  limit?: number | undefined;
  offset?: number | undefined;
  status?: string | undefined;
  q?: string | undefined;
  ownerId?: string | undefined;
};

export function useTickets(params: TicketListParams) {
  return useQuery({
    queryKey: qk.support.list(params),
    queryFn: () => apiFetch<Paginated<Ticket>>("/support/tickets", { query: params }),
    placeholderData: (previous) => previous,
  });
}

export function useTicket(id: string) {
  return useQuery({
    queryKey: qk.support.detail(id),
    queryFn: () => apiFetch<TicketDetail>(`/support/tickets/${id}`),
    enabled: !!id,
  });
}

export type CreateTicketInput = {
  ownerId?: string | undefined;
  propertyId?: string | undefined;
  subject: string;
  category?: string | undefined;
  priority?: "LOW" | "NORMAL" | "HIGH" | "CRITICAL" | undefined;
  body?: string | undefined;
};

export function useCreateTicket() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateTicketInput) =>
      apiFetch<TicketDetail>("/support/tickets", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.support.all }),
  });
}

export function useReplyToTicket(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { body: string; isInternalNote?: boolean }) =>
      apiFetch<SupportMessage>(`/support/tickets/${ticketId}/messages`, {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.support.detail(ticketId) });
      qc.invalidateQueries({ queryKey: qk.support.all });
    },
  });
}

export function useAssignTicket(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (adminId: string) =>
      apiFetch<TicketDetail>(`/support/tickets/${ticketId}/assign`, {
        method: "POST",
        body: { adminId },
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.support.all }),
  });
}

export function useTicketStatusAction(ticketId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (action: "resolve" | "close") =>
      apiFetch<TicketDetail>(`/support/tickets/${ticketId}/${action}`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.support.all });
      qc.invalidateQueries({ queryKey: qk.audit.all });
    },
  });
}
