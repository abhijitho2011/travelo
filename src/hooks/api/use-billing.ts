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

/** Methods the backend accepts for money that arrived outside a gateway. */
export const MANUAL_PAYMENT_METHODS = ["CASH", "BANK_TRANSFER", "UPI", "CHEQUE"] as const;
export type ManualPaymentMethod = (typeof MANUAL_PAYMENT_METHODS)[number];

export type ManualPaymentInput = {
  ownerId: string;
  subscriptionId?: string | undefined;
  /** Minor units. The dialog collects rupees and multiplies by 100. */
  amountPaise: number;
  method: ManualPaymentMethod;
  reference?: string | undefined;
  note?: string | undefined;
};

/**
 * Records cash, an NEFT, a UPI transfer or a cheque. The backend settles it
 * through the same path a gateway webhook uses — the subscription is renewed
 * and an invoice is issued — so this invalidates subscriptions too.
 */
export function useRecordManualPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ManualPaymentInput) =>
      apiFetch<{ payment: Payment; invoice: Invoice }>("/billing/payments/manual", {
        method: "POST",
        body: input,
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.billing.all });
      qc.invalidateQueries({ queryKey: qk.subscriptions.all });
      qc.invalidateQueries({ queryKey: qk.audit.all });
    },
  });
}

export const GATEWAYS = ["RAZORPAY", "CASHFREE"] as const;
export type Gateway = (typeof GATEWAYS)[number];

/** The order a gateway raises; the owner completes payment against it. */
export type GatewayOrder = {
  paymentId: string;
  gateway: Gateway;
  orderId: string;
  amount: number;
  currency: string;
  keyId?: string;
  paymentSessionId?: string;
  appId?: string;
};

/**
 * Raises a PENDING gateway order (Razorpay or Cashfree) for an owner's
 * subscription. Errors GATEWAY_NOT_CONFIGURED when the chosen gateway has no
 * credentials — the desk then falls back to a manual payment. Parks a PENDING
 * payment row, so billing is invalidated.
 */
export function useCreateGatewayOrder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { ownerId: string; subscriptionId: string; gateway: Gateway }) =>
      apiFetch<GatewayOrder>("/billing/payments/orders", { method: "POST", body: input }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: qk.billing.all });
    },
  });
}

/** Presigned, short-lived URL for an invoice document; 404s until one exists. */
export function useInvoiceDocumentUrl() {
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ url: string; expiresInSeconds: number }>(`/billing/invoices/${id}/document`),
  });
}

/** (Re)generates the invoice PDF and returns a link to it. */
export function useGenerateInvoicePdf() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<{ storageKey: string; url: string }>(`/billing/invoices/${id}/generate-pdf`, {
        method: "POST",
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: qk.billing.all }),
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
