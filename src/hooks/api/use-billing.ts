import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch, type Paginated } from "@/lib/api";
import { qk } from "@/hooks/api/keys";
import type { Invoice, Payment, PaymentDetail, Refund } from "@/hooks/api/types";

export type BillingListParams = {
  limit?: number | undefined;
  offset?: number | undefined;
  ownerId?: string | undefined;
  status?: string | undefined;
};

export function usePayments(params: BillingListParams) {
  return useQuery({
    queryKey: qk.billing.payments(params),
    queryFn: () => apiFetch<Paginated<Payment>>("/billing/payments", { query: params }),
    placeholderData: (previous) => previous,
  });
}

export function usePayment(id: string) {
  return useQuery({
    queryKey: qk.billing.payment(id),
    queryFn: () => apiFetch<PaymentDetail>(`/billing/payments/${id}`),
    enabled: !!id,
  });
}

export function useFailedPayments(limit = 20) {
  return useQuery({
    queryKey: qk.billing.failed(limit),
    queryFn: () => apiFetch<Paginated<Payment>>("/billing/failed", { query: { limit } }),
  });
}

export function useRefunds(params: { limit?: number; offset?: number }) {
  return useQuery({
    queryKey: qk.billing.refunds(params),
    queryFn: () => apiFetch<Paginated<Refund>>("/billing/refunds", { query: params }),
    placeholderData: (previous) => previous,
  });
}

export function useRefundPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, amount, reason }: { id: string; amount: number; reason?: string }) =>
      apiFetch<Refund>(`/billing/payments/${id}/refund`, {
        method: "POST",
        body: { amount, reason },
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.billing.all });
      qc.invalidateQueries({ queryKey: qk.audit.all });
    },
  });
}

export function useInvoices(params: BillingListParams) {
  return useQuery({
    queryKey: qk.billing.invoices(params),
    queryFn: () => apiFetch<Paginated<Invoice>>("/billing/invoices", { query: params }),
    placeholderData: (previous) => previous,
  });
}

export function useInvoice(id: string) {
  return useQuery({
    queryKey: qk.billing.invoice(id),
    queryFn: () => apiFetch<Invoice>(`/billing/invoices/${id}`),
    enabled: !!id,
  });
}

export type CreateInvoiceInput = {
  ownerId: string;
  subscriptionId?: string | undefined;
  billingPeriodStart: string;
  billingPeriodEnd: string;
  subtotal: number;
  tax?: number | undefined;
  discount?: number | undefined;
  currency?: string | undefined;
  dueDate?: string | undefined;
};

export function useCreateInvoice() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateInvoiceInput) =>
      apiFetch<Invoice>("/billing/invoices", { method: "POST", body: input }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.billing.all }),
  });
}

export type InvoiceAction = "issue" | "mark-paid" | "cancel";

export function useInvoiceAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, action }: { id: string; action: InvoiceAction }) =>
      apiFetch<Invoice>(`/billing/invoices/${id}/${action}`, { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.billing.all });
      qc.invalidateQueries({ queryKey: qk.audit.all });
    },
  });
}
