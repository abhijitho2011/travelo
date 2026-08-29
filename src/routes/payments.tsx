import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable, type Column } from "@/components/admin/data-table";
import { ExportButton } from "@/components/admin/export-button";
import { StatusFilter, ToolbarActions } from "@/components/admin/list-toolbar";
import { PageHeader, StatusBadge } from "@/components/admin/primitives";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import type { Payment } from "@/hooks/api/types";
import {
  MANUAL_PAYMENT_METHODS,
  usePayments,
  useRecordManualPayment,
  useRefundPayment,
  type ManualPaymentMethod,
} from "@/hooks/api/use-billing";
import { useOwners } from "@/hooks/api/use-owners";
import { useSubscriptions } from "@/hooks/api/use-subscriptions";
import { useListParams } from "@/hooks/use-list-params";
import { errorMessage } from "@/lib/api";
import { formatDate, formatDateTime, humanise, inr } from "@/lib/format";

export const Route = createFileRoute("/payments")({
  head: () => ({
    meta: [
      { title: "Payments · Tavelo Super Admin" },
      { name: "description", content: "Subscription payments, failures and refunds." },
    ],
  }),
  component: PaymentsPage,
});

const PAYMENT_STATUSES = ["SUCCESS", "PENDING", "FAILED", "REFUNDED", "PARTIALLY_REFUNDED"];

function RefundDialog({ payment }: { payment: Payment }) {
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(String(payment.amount / 100));
  const [reason, setReason] = useState("");
  const refund = useRefundPayment();

  const minorUnits = Math.round(Number(amount) * 100);
  const invalid = !(minorUnits >= 1 && minorUnits <= payment.amount) || reason.trim().length < 4;

  const submit = async () => {
    try {
      await refund.mutateAsync({ id: payment.id, amount: minorUnits, reason: reason.trim() });
      toast.success("Refund created", {
        description: `${inr(minorUnits)} queued for ${payment.owner ?? "the owner"}.`,
      });
      setOpen(false);
      setReason("");
    } catch (error) {
      toast.error("Could not refund payment", { description: errorMessage(error) });
    }
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 text-xs">
          Refund
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Refund payment</DialogTitle>
          <DialogDescription>
            Original charge {inr(payment.amount)} · {payment.provider ?? "unknown provider"}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="refund-amount">Refund amount (₹)</Label>
            <Input
              id="refund-amount"
              type="number"
              min={0.01}
              step="0.01"
              max={payment.amount / 100}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="refund-reason">Reason (recorded in audit log)</Label>
            <Textarea
              id="refund-reason"
              rows={2}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={invalid || refund.isPending} onClick={() => void submit()}>
            {refund.isPending && <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />}
            Issue refund
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** No subscription chosen — the payment is recorded against the owner alone. */
const NO_SUBSCRIPTION = "__none__";

/**
 * Records money that arrived outside a payment gateway.
 *
 * The backend settles this through the same path a gateway webhook uses: the
 * chosen subscription is renewed from the later of today and its current period
 * end, and an invoice is issued for that period. Picking a subscription is
 * therefore the difference between "a payment was received" and "the owner has
 * another year".
 */
function ManualPaymentDialog() {
  const [open, setOpen] = useState(false);
  const [ownerId, setOwnerId] = useState("");
  const [subscriptionId, setSubscriptionId] = useState(NO_SUBSCRIPTION);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<ManualPaymentMethod>("BANK_TRANSFER");
  const [reference, setReference] = useState("");
  const [note, setNote] = useState("");

  const owners = useOwners({ limit: 200, offset: 0 });
  const subscriptions = useSubscriptions({ limit: 50, offset: 0, ownerId: ownerId || undefined });
  const record = useRecordManualPayment();

  const amountPaise = Math.round(Number(amount) * 100);
  const invalid = !ownerId || !Number.isFinite(amountPaise) || amountPaise < 1;

  const reset = () => {
    setOwnerId("");
    setSubscriptionId(NO_SUBSCRIPTION);
    setAmount("");
    setReference("");
    setNote("");
  };

  const submit = async () => {
    try {
      await record.mutateAsync({
        ownerId,
        subscriptionId: subscriptionId === NO_SUBSCRIPTION ? undefined : subscriptionId,
        amountPaise,
        method,
        reference: reference.trim() || undefined,
        note: note.trim() || undefined,
      });
      toast.success("Payment recorded", {
        description:
          subscriptionId === NO_SUBSCRIPTION
            ? `${inr(amountPaise)} recorded and invoiced.`
            : `${inr(amountPaise)} recorded — the subscription has been renewed and invoiced.`,
      });
      setOpen(false);
      reset();
    } catch (error) {
      toast.error("Could not record payment", { description: errorMessage(error) });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="h-8 text-xs">
          <Plus aria-hidden className="mr-1.5 size-3.5" />
          Record manual payment
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Record manual payment</DialogTitle>
          <DialogDescription>
            Cash, a bank transfer, UPI or a cheque. Choosing a subscription renews it and issues an
            invoice for the new period.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="manual-owner">Owner</Label>
            <Select
              value={ownerId}
              onValueChange={(value) => {
                setOwnerId(value);
                setSubscriptionId(NO_SUBSCRIPTION);
              }}
            >
              <SelectTrigger id="manual-owner">
                <SelectValue placeholder={owners.isLoading ? "Loading…" : "Select an owner"} />
              </SelectTrigger>
              <SelectContent>
                {(owners.data?.items ?? []).map((owner) => (
                  <SelectItem key={owner.id} value={owner.id}>
                    {owner.company ?? owner.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="manual-subscription">Subscription (optional)</Label>
            <Select value={subscriptionId} onValueChange={setSubscriptionId} disabled={!ownerId}>
              <SelectTrigger id="manual-subscription">
                <SelectValue placeholder="No subscription — record only" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value={NO_SUBSCRIPTION}>No subscription — record only</SelectItem>
                {(subscriptions.data?.items ?? []).map((sub) => (
                  <SelectItem key={sub.id} value={sub.id}>
                    {sub.plan} · expires {formatDate(sub.currentPeriodEnd)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="manual-amount">Amount (₹)</Label>
              <Input
                id="manual-amount"
                type="number"
                min={0.01}
                step="0.01"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="manual-method">Method</Label>
              <Select
                value={method}
                onValueChange={(value) => setMethod(value as ManualPaymentMethod)}
              >
                <SelectTrigger id="manual-method">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {MANUAL_PAYMENT_METHODS.map((m) => (
                    <SelectItem key={m} value={m}>
                      {humanise(m)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="manual-reference">Reference (UTR, cheque no.)</Label>
            <Input
              id="manual-reference"
              value={reference}
              onChange={(e) => setReference(e.target.value)}
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="manual-note">Note (recorded in audit log)</Label>
            <Textarea
              id="manual-note"
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button disabled={invalid || record.isPending} onClick={() => void submit()}>
            {record.isPending && <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />}
            Record payment
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function PaymentsPage() {
  const list = useListParams();
  const query = usePayments({
    limit: list.limit,
    offset: list.offset,
    status: list.statusParam,
  });

  const columns: Column<Payment>[] = [
    {
      key: "owner",
      header: "Owner",
      cell: (p) =>
        p.ownerId ? (
          <Link
            to="/owners/$ownerId"
            params={{ ownerId: p.ownerId }}
            className="font-medium text-primary hover:underline"
          >
            {p.owner ?? p.ownerId}
          </Link>
        ) : (
          (p.owner ?? "—")
        ),
    },
    { key: "amount", header: "Amount", align: "right", cell: (p) => inr(p.amount) },
    { key: "status", header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
    { key: "provider", header: "Provider", cell: (p) => p.provider ?? "—" },
    { key: "method", header: "Method", cell: (p) => humanise(p.method) },
    {
      key: "failure",
      header: "Failure reason",
      cell: (p) => <span className="text-xs text-muted-foreground">{p.failureReason ?? "—"}</span>,
    },
    { key: "created", header: "Date", cell: (p) => formatDateTime(p.createdAt) },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Monetization"
        title="Payments"
        description="Every subscription charge, its outcome and refund state."
      />
      <div className="p-5 lg:p-6">
        <DataTable
          rows={query.data?.items ?? []}
          columns={columns}
          rowKey={(p) => p.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          rowActions={(p) =>
            p.status === "SUCCESS" || p.status === "PARTIALLY_REFUNDED" ? (
              <RefundDialog payment={p} />
            ) : null
          }
          emptyTitle="No payments match this view"
          emptyDescription="Change the status filter, or wait for the first charge to settle."
          pagination={{
            total: query.data?.total ?? 0,
            limit: list.limit,
            offset: list.offset,
            onOffsetChange: list.setOffset,
          }}
          toolbar={
            <>
              <StatusFilter
                value={list.status}
                onChange={list.setStatus}
                options={PAYMENT_STATUSES}
              />
              <ToolbarActions>
                <span className="tnum text-xs text-muted-foreground">
                  {query.data?.total ?? 0} total
                </span>
                <ExportButton entity="payments" filters={{ status: list.statusParam }} />
                <ManualPaymentDialog />
              </ToolbarActions>
            </>
          }
        />
      </div>
    </>
  );
}
