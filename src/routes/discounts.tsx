import { createFileRoute } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { DataTable, type Column } from "@/components/admin/data-table";
import { KpiCard, PageHeader, StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { inr } from "@/lib/travelo-data";

export const Route = createFileRoute("/discounts")({
  head: () => ({
    meta: [
      { title: "Discounts & Coupons · Travelo Super Admin" },
      { name: "description", content: "Create and track promotional discounts, coupon codes and negotiated pricing for hotel owners." },
      { property: "og:title", content: "Discounts & Coupons · Travelo Super Admin" },
      { property: "og:description", content: "Promotional pricing controls for Travelo subscriptions." },
    ],
  }),
  component: DiscountsPage,
});

type Coupon = {
  code: string; label: string; type: string; value: string; applies: string;
  redemptions: number; cap: number; revenue: number; expiry: string; status: string;
};

const coupons: Coupon[] = [
  { code: "MONSOON25", label: "Monsoon onboarding", type: "Percentage", value: "25% off first year", applies: "Standard, Growth", redemptions: 34, cap: 100, revenue: 1240000, expiry: "30 Sep 2026", status: "Active" },
  { code: "GROUP10", label: "Multi-property group", type: "Percentage", value: "10% recurring", applies: "Growth, Enterprise", redemptions: 12, cap: 50, revenue: 2860000, expiry: "31 Dec 2026", status: "Active" },
  { code: "TRIAL45", label: "Extended trial", type: "Trial extension", value: "+45 days trial", applies: "Starter", redemptions: 21, cap: 40, revenue: 0, expiry: "31 Oct 2026", status: "Active" },
  { code: "WINBACK50", label: "Churn win-back", type: "Fixed amount", value: "₹50,000 credit", applies: "All plans", redemptions: 6, cap: 25, revenue: 640000, expiry: "15 Sep 2026", status: "Scheduled" },
  { code: "EXPO2025", label: "Hotel expo signup", type: "Percentage", value: "15% off annual", applies: "All plans", redemptions: 48, cap: 48, revenue: 3120000, expiry: "31 Mar 2026", status: "Expired" },
];

function DiscountsPage() {
  const columns: Column<Coupon>[] = [
    {
      key: "code", header: "Code", sortValue: (c) => c.code,
      cell: (c) => (
        <span>
          <span className="tnum block font-semibold">{c.code}</span>
          <span className="block text-xs text-muted-foreground">{c.label}</span>
        </span>
      ),
    },
    { key: "type", header: "Type", cell: (c) => <span className="text-muted-foreground">{c.type}</span> },
    { key: "value", header: "Benefit", cell: (c) => c.value },
    { key: "applies", header: "Applies to", optional: true, cell: (c) => <span className="text-muted-foreground">{c.applies}</span> },
    { key: "used", header: "Redeemed", align: "right", sortValue: (c) => c.redemptions, cell: (c) => <span className="tnum">{c.redemptions} / {c.cap}</span> },
    { key: "revenue", header: "Influenced revenue", align: "right", sortValue: (c) => c.revenue, cell: (c) => <span className="tnum">{inr(c.revenue)}</span> },
    { key: "expiry", header: "Expires", cell: (c) => <span className="tnum">{c.expiry}</span> },
    { key: "status", header: "Status", cell: (c) => <StatusBadge status={c.status} /> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Monetization"
        title="Discounts & Coupons"
        description="Promotional pricing, negotiated deals and trial extensions with redemption caps."
        breadcrumbs={[{ label: "Super Admin", to: "/" }, { label: "Discounts" }]}
        actions={
          <Button size="sm" className="h-8" onClick={() => toast.info("Coupon builder", { description: "Define code, benefit, eligible plans and redemption cap." })}>
            <Plus aria-hidden className="mr-1.5 size-3.5" /> New coupon
          </Button>
        }
      />
      <div className="space-y-4 p-4 lg:p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Active coupons" value="3" hint="1 scheduled" />
          <KpiCard label="Redemptions (90d)" value="73" delta="+18" />
          <KpiCard label="Discount given" value="₹9.4L" trend="down" delta="4.1% of revenue" />
          <KpiCard label="Influenced revenue" value="₹78.6L" delta="+12.2%" />
        </div>
        <DataTable
          rows={coupons}
          columns={columns}
          rowKey={(c) => c.code}
          searchKeys={(c) => `${c.code} ${c.label} ${c.type}`}
          searchPlaceholder="Search code or campaign…"
          exportName="Discounts"
          emptyTitle="No coupons yet"
          emptyDescription="Create a coupon to run acquisition or win-back campaigns."
        />
      </div>
    </>
  );
}
