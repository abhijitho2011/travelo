import { createFileRoute, Link } from "@tanstack/react-router";
import { FileText, Loader2, Plus } from "lucide-react";
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
import type { Invoice } from "@/hooks/api/types";
import {
  useCreateInvoice,
  useGenerateInvoicePdf,
  useInvoiceAction,
  useInvoiceDocumentUrl,
  useInvoices,
  type InvoiceAction,
} from "@/hooks/api/use-billing";
import { useOwners } from "@/hooks/api/use-owners";
import { useListParams } from "@/hooks/use-list-params";
import { errorMessage } from "@/lib/api";
import { formatDate, inr } from "@/lib/format";

function CreateInvoiceDialog() {
  const [open, setOpen] = useState(false);
  const [ownerId, setOwnerId] = useState("");
  const [start, setStart] = useState("");
  const [end, setEnd] = useState("");
  const [subtotal, setSubtotal] = useState("");
  const [tax, setTax] = useState("");
  const [discount, setDiscount] = useState("");
  const [dueDate, setDueDate] = useState("");

  const owners = useOwners({ limit: 200, offset: 0 });
  const create = useCreateInvoice();

  const subtotalPaise = Math.round(Number(subtotal) * 100);
  const invalid = !ownerId || !start || !end || !(subtotalPaise >= 0 && Number.isFinite(subtotalPaise)) || !subtotal;

  const reset = () => {
    setOwnerId("");
    setStart("");
    setEnd("");
    setSubtotal("");
    setTax("");
    setDiscount("");
    setDueDate("");
  };

  const submit = async () => {
    try {
      await create.mutateAsync({
        ownerId,
        billingPeriodStart: start,
        billingPeriodEnd: end,
        subtotal: subtotalPaise,
        tax: tax ? Math.round(Number(tax) * 100) : undefined,
        discount: discount ? Math.round(Number(discount) * 100) : undefined,
        dueDate: dueDate || undefined,
      });
      toast.success("Invoice created", { description: "Saved as a draft." });
      setOpen(false);
      reset();
    } catch (error) {
      toast.error("Could not create invoice", { description: errorMessage(error) });
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
        <Button size="sm" className="h-8">
          <Plus aria-hidden className="mr-1.5 size-3.5" /> New invoice
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New invoice</DialogTitle>
          <DialogDescription>
            Creates a draft invoice. Issue it from the list once the details are right.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="inv-owner">Owner</Label>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger id="inv-owner">
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
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inv-start">Period start</Label>
              <Input id="inv-start" type="date" value={start} onChange={(e) => setStart(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-end">Period end</Label>
              <Input id="inv-end" type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="inv-subtotal">Subtotal (₹)</Label>
              <Input id="inv-subtotal" type="number" min={0} step="0.01" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-tax">Tax (₹)</Label>
              <Input id="inv-tax" type="number" min={0} step="0.01" value={tax} onChange={(e) => setTax(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="inv-discount">Discount (₹)</Label>
              <Input id="inv-discount" type="number" min={0} step="0.01" value={discount} onChange={(e) => setDiscount(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="inv-due">Due date (optional)</Label>
            <Input id="inv-due" type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button disabled={invalid || create.isPending} onClick={() => void submit()}>
            {create.isPending && <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />}
            Create draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

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
        actions={<CreateInvoiceDialog />}
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
