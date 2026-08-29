import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { toast } from "sonner";

import { DataTable, type Column } from "@/components/admin/data-table";
import { ExportButton } from "@/components/admin/export-button";
import { StatusFilter, ToolbarActions } from "@/components/admin/list-toolbar";
import { PageHeader, StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import type { Invoice } from "@/hooks/api/types";
import {
  useGenerateInvoicePdf,
  useInvoiceAction,
  useInvoiceDocumentUrl,
  useInvoices,
  type InvoiceAction,
} from "@/hooks/api/use-billing";
import { useListParams } from "@/hooks/use-list-params";
import { errorMessage } from "@/lib/api";
import { formatDate, inr } from "@/lib/format";

export const Route = createFileRoute("/invoices")({
  head: () => ({
    meta: [
      { title: "Invoices · Tavelo Super Admin" },
      { name: "description", content: "Draft, issued, paid and cancelled subscription invoices." },
    ],
  }),
  component: InvoicesPage,
});

const INVOICE_STATUSES = ["DRAFT", "ISSUED", "PAID", "CANCELLED", "OVERDUE"];

/**
 * Download the invoice PDF, or generate it if none exists yet.
 *
 * PDFs are produced best-effort after a payment settles, so an invoice can
 * legitimately have none — a storage hiccup must never have rolled back the
 * money. "Generate PDF" is that retry, and it is always available so a
 * document can be rebuilt after the invoice details change.
 */
function InvoiceDocumentButton({ invoice }: { invoice: Invoice }) {
  const link = useInvoiceDocumentUrl();
  const generate = useGenerateInvoicePdf();
  const busy = link.isPending || generate.isPending;

  const open = (url: string) => window.open(url, "_blank", "noopener,noreferrer");

  const download = async () => {
    try {
      open((await link.mutateAsync(invoice.id)).url);
    } catch {
      // No document yet (or the link expired) — build one and open that.
      await regenerate();
    }
  };

  const regenerate = async () => {
    try {
      const result = await generate.mutateAsync(invoice.id);
      toast.success("Invoice PDF ready", { description: invoice.invoiceNumber });
      open(result.url);
    } catch (error) {
      toast.error("Could not generate the invoice PDF", { description: errorMessage(error) });
    }
  };

  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-7 text-xs"
      disabled={busy}
      onClick={() => void (invoice.hasDocument ? download() : regenerate())}
    >
      <FileText aria-hidden className="mr-1 size-3.5" />
      {invoice.hasDocument ? "Download" : "Generate PDF"}
    </Button>
  );
}

function InvoiceActions({ invoice }: { invoice: Invoice }) {
  const action = useInvoiceAction();

  const run = async (name: InvoiceAction, label: string) => {
    try {
      await action.mutateAsync({ id: invoice.id, action: name });
      toast.success(label, { description: `Invoice ${invoice.invoiceNumber} updated.` });
    } catch (error) {
      toast.error("Could not update invoice", { description: errorMessage(error) });
    }
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <InvoiceDocumentButton invoice={invoice} />
      {invoice.status === "DRAFT" && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          disabled={action.isPending}
          onClick={() => void run("issue", "Invoice issued")}
        >
          Issue
        </Button>
      )}
      {invoice.status !== "PAID" && invoice.status !== "CANCELLED" && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs"
          disabled={action.isPending}
          onClick={() => void run("mark-paid", "Invoice marked paid")}
        >
          Mark paid
        </Button>
      )}
      {invoice.status !== "CANCELLED" && invoice.status !== "PAID" && (
        <Button
          variant="ghost"
          size="sm"
          className="h-7 text-xs text-destructive"
          disabled={action.isPending}
          onClick={() => void run("cancel", "Invoice cancelled")}
        >
          Cancel
        </Button>
      )}
    </div>
  );
}

function InvoicesPage() {
  const list = useListParams();
  const query = useInvoices({
    limit: list.limit,
    offset: list.offset,
    status: list.statusParam,
  });

  const columns: Column<Invoice>[] = [
    {
      key: "number",
      header: "Invoice",
      cell: (i) => <span className="font-mono text-xs font-semibold">{i.invoiceNumber}</span>,
    },
    {
      key: "owner",
      header: "Owner",
      cell: (i) => (
        <Link
          to="/owners/$ownerId"
          params={{ ownerId: i.ownerId }}
          className="text-primary hover:underline"
        >
          {i.owner ?? i.ownerId}
        </Link>
      ),
    },
    {
      key: "period",
      header: "Billing period",
      cell: (i) => `${formatDate(i.billingPeriodStart)} → ${formatDate(i.billingPeriodEnd)}`,
    },
    { key: "subtotal", header: "Subtotal", align: "right", cell: (i) => inr(i.subtotal) },
    { key: "tax", header: "Tax", align: "right", cell: (i) => inr(i.tax) },
    { key: "total", header: "Total", align: "right", cell: (i) => inr(i.total) },
    { key: "status", header: "Status", cell: (i) => <StatusBadge status={i.status} /> },
    { key: "due", header: "Due", cell: (i) => formatDate(i.dueDate) },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Monetization"
        title="Invoices"
        description="Issue, settle or cancel subscription invoices."
      />
      <div className="p-5 lg:p-6">
        <DataTable
          rows={query.data?.items ?? []}
          columns={columns}
          rowKey={(i) => i.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          rowActions={(i) => <InvoiceActions invoice={i} />}
          emptyTitle="No invoices match this view"
          emptyDescription="Invoices appear once a billing period closes for a subscription."
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
                options={INVOICE_STATUSES}
              />
              <ToolbarActions>
                <span className="tnum text-xs text-muted-foreground">
                  {query.data?.total ?? 0} total
                </span>
                <ExportButton entity="invoices" filters={{ status: list.statusParam }} />
              </ToolbarActions>
            </>
          }
        />
      </div>
    </>
  );
}
