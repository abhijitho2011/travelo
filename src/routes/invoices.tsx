import { createFileRoute, Link } from "@tanstack/react-router";
import { Download, Send } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { DataTable, type Column } from "@/components/admin/data-table";
import { KpiCard, PageHeader, StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { inr, invoices } from "@/lib/travelo-data";

export const Route = createFileRoute("/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices · Travelo Super Admin" },
      { name: "description", content: "GST-compliant subscription invoices with status, dues and bulk export for finance reconciliation." },
      { property: "og:title", content: "Invoices · Travelo Super Admin" },
      { property: "og:description", content: "Invoice register for all Travelo hotel owners." },
    ],
  }),
  component: InvoicesPage,
});

type Invoice = (typeof invoices)[number];

function InvoicesPage() {
  const [status, setStatus] = useState("all");
  const rows = invoices.filter((i) => status === "all" || i.status === status);

  const columns: Column<Invoice>[] = [
    { key: "id", header: "Invoice", cell: (i) => <span className="tnum font-semibold">{i.id}</span> },
    {
      key: "owner", header: "Owner", sortValue: (i) => i.owner,
      cell: (i) => (
        <Link to="/owners/$ownerId" params={{ ownerId: i.ownerId }} className="hover:text-primary hover:underline">{i.owner}</Link>
      ),
    },
    { key: "period", header: "Billing period", optional: true, cell: (i) => <span className="text-muted-foreground">{i.period}</span> },
    { key: "amount", header: "Subtotal", align: "right", sortValue: (i) => i.amount, cell: (i) => <span className="tnum">{inr(i.amount)}</span> },
    { key: "tax", header: "GST", align: "right", optional: true, cell: (i) => <span className="tnum text-muted-foreground">{inr(i.tax)}</span> },
    { key: "total", header: "Total", align: "right", sortValue: (i) => i.total, cell: (i) => <span className="tnum font-semibold">{inr(i.total)}</span> },
    { key: "due", header: "Due date", sortValue: (i) => i.due, cell: (i) => <span className="tnum">{i.due}</span> },
    { key: "status", header: "Status", cell: (i) => <StatusBadge status={i.status} /> },
    {
      key: "actions", header: "",
      cell: (i) => (
        <span className="flex justify-end gap-1">
          <Button variant="ghost" size="icon" className="size-7" aria-label={`Download ${i.id}`} onClick={() => toast.success(`${i.id}.pdf downloaded`)}>
            <Download aria-hidden className="size-4" />
          </Button>
          <Button variant="ghost" size="icon" className="size-7" aria-label={`Email ${i.id}`} onClick={() => toast.success(`${i.id} emailed to ${i.owner}`)}>
            <Send aria-hidden className="size-4" />
          </Button>
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Monetization"
        title="Invoices"
        description="GST-compliant invoice register with dues tracking and finance-ready exports."
        breadcrumbs={[{ label: "Super Admin", to: "/" }, { label: "Invoices" }]}
        actions={
          <Button variant="outline" size="sm" className="h-8" onClick={() => toast.success("Export queued", { description: "A CSV of the current view will download shortly." })}>
            <Download aria-hidden className="mr-1.5 size-3.5" /> Export ledger
          </Button>
        }
      />
      <div className="space-y-4 p-4 lg:p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Invoiced (MTD)" value="₹52.9L" delta="+7.8%" />
          <KpiCard label="Paid" value="₹45.4L" delta="86% collection" />
          <KpiCard label="Pending" value="₹6.4L" hint="within terms" />
          <KpiCard label="Overdue" value="₹1.1L" trend="down" delta="4 invoices" />
        </div>

        <DataTable
          rows={rows}
          columns={columns}
          rowKey={(i) => i.id}
          searchKeys={(i) => `${i.id} ${i.owner}`}
          searchPlaceholder="Search invoice or owner…"
          exportName="Invoices"
          filters={
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger className="h-8 w-[160px] text-sm" aria-label="Filter by invoice status">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All statuses</SelectItem>
                <SelectItem value="Paid">Paid</SelectItem>
                <SelectItem value="Pending">Pending</SelectItem>
                <SelectItem value="Overdue">Overdue</SelectItem>
              </SelectContent>
            </Select>
          }
          emptyTitle="No invoices found"
          emptyDescription="Invoices are generated automatically on each billing cycle."
        />
      </div>
    </>
  );
}
