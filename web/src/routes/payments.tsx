import { createFileRoute, Link } from "@tanstack/react-router";
import { MoreHorizontal } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { DataTable, type Column } from "@/components/admin/data-table";
import { KpiCard, MetricRow, PageHeader, StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { inr, payments } from "@/lib/travelo-data";

export const Route = createFileRoute("/payments")({
  head: () => ({
    meta: [
      { title: "Payments · Travelo Super Admin" },
      { name: "description", content: "Monitor successful, failed, pending and refunded subscription payments across all hotel owners." },
      { property: "og:title", content: "Payments · Travelo Super Admin" },
      { property: "og:description", content: "Payment monitoring, retries and refunds for Travelo subscriptions." },
    ],
  }),
  component: PaymentsPage,
});

type Payment = (typeof payments)[number];

function PaymentsPage() {
  const [status, setStatus] = useState("all");
  const [detail, setDetail] = useState<Payment | null>(null);
  const rows = payments.filter((p) => status === "all" || p.status === status);

  const columns: Column<Payment>[] = [
    { key: "id", header: "Payment ID", cell: (p) => <span className="tnum font-semibold">{p.id}</span> },
    {
      key: "owner", header: "Owner", sortValue: (p) => p.owner,
      cell: (p) => (
        <Link to="/owners/$ownerId" params={{ ownerId: p.ownerId }} onClick={(e) => e.stopPropagation()} className="hover:text-primary hover:underline">
          {p.owner}
        </Link>
      ),
    },
    { key: "plan", header: "Plan", optional: true, cell: (p) => <span className="text-muted-foreground">{p.plan}</span> },
    { key: "amount", header: "Amount", align: "right", sortValue: (p) => p.amount, cell: (p) => <span className="tnum font-semibold">{inr(p.amount)}</span> },
    { key: "method", header: "Method", cell: (p) => <span className="text-muted-foreground">{p.method}</span> },
    { key: "date", header: "Date", sortValue: (p) => p.date, cell: (p) => <span className="tnum">{p.date}</span> },
    { key: "status", header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Monetization"
        title="Payments"
        description="Every subscription charge with retry, refund and reconciliation controls."
        breadcrumbs={[{ label: "Super Admin", to: "/" }, { label: "Payments" }]}
      />
      <div className="space-y-4 p-4 lg:p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Collected (MTD)" value="₹48.2L" delta="+9.1%" hint="vs last month" />
          <KpiCard label="Successful" value="126" delta="+14" />
          <KpiCard label="Failed" value="3" trend="down" delta="₹1.9L blocked" />
          <KpiCard label="Refunded" value="₹45,000" trend="down" delta="1 payment" />
        </div>

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(p) => p.id}
          searchKeys={(p) => `${p.id} ${p.owner} ${p.method}`}
          searchPlaceholder="Search payment ID, owner or method…"
          exportName="Payments"
          onRowClick={(p) => setDetail(p)}
          filters={
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 w-[170px] text-sm" aria-label="Filter by payment status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="Successful">Successful</SelectItem>
                <SelectItem value="Failed">Failed</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Refunded">Refunded</SelectItem>
              </SelectContent>
            </Select>
          }
          rowActions={(p) => (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="size-7" aria-label={`Actions for ${p.id}`}>
                  <MoreHorizontal aria-hidden className="size-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setDetail(p)}>View details</DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.success(`Retry initiated for ${p.id}`)}>Retry charge</DropdownMenuItem>
                <DropdownMenuItem onClick={() => toast.success("Receipt emailed to owner")}>Send receipt</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          emptyTitle="No payments found"
          emptyDescription="Adjust the status filter to see other payment activity."
        />
      </div>

      <Sheet open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <SheetContent className="w-full sm:max-w-md">
          {detail && (
            <>
              <SheetHeader>
                <SheetTitle>{detail.id}</SheetTitle>
                <SheetDescription>{detail.owner} · {detail.plan}</SheetDescription>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                <StatusBadge status={detail.status} />
                <dl>
                  <MetricRow label="Amount" value={inr(detail.amount)} />
                  <MetricRow label="Tax (18% GST)" value={inr(Math.round(detail.amount * 0.18))} />
                  <MetricRow label="Method" value={detail.method} />
                  <MetricRow label="Date" value={detail.date} />
                  <MetricRow label="Gateway" value="Razorpay" />
                  <MetricRow label="Gateway reference" value={`rzp_${detail.id.toLowerCase()}`} />
                </dl>
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" className="h-8" onClick={() => toast.success(`Retry initiated for ${detail.id}`)}>Retry charge</Button>
                  <Button variant="outline" size="sm" className="h-8" onClick={() => toast.success("Receipt emailed")}>Send receipt</Button>
                  <ConfirmDialog
                    trigger={<Button variant="outline" size="sm" className="h-8 text-destructive">Issue refund</Button>}
                    title={`Refund ${inr(detail.amount)} to ${detail.owner}?`}
                    description="Refunds are irreversible and are reported in the finance ledger."
                    impact={["Gateway refund initiated", "Invoice marked as credited", "Owner notified by email"]}
                    confirmLabel="Issue refund"
                  />
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>
    </>
  );
}
