import { createFileRoute, Link } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable, type Column } from "@/components/admin/data-table";
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
import { Textarea } from "@/components/ui/textarea";
import type { Payment } from "@/hooks/api/types";
import { usePayments, useRefundPayment } from "@/hooks/api/use-billing";
import { useListParams } from "@/hooks/use-list-params";
import { errorMessage } from "@/lib/api";
import { formatDateTime, humanise, inr } from "@/lib/format";

export const Route = createFileRoute("/payments")({
  head: () => ({
    meta: [
      { title: "Payments · Tavelo Super Admin" },
      { name: "description", content: "Subscription payments, failures and refunds." },
    ],
  }),
  component: PaymentsPage,
});

const PAYMENT_STATUSES = [
  "SUCCESS",
  "PENDING",
  "FAILED",
  "REFUNDED",
  "PARTIALLY_REFUNDED",
];

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
      cell: (p) => (
        <span className="text-xs text-muted-foreground">{p.failureReason ?? "—"}</span>
      ),
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
              </ToolbarActions>
            </>
          }
        />
      </div>
    </>
  );
}
