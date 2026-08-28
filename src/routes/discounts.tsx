import { createFileRoute } from "@tanstack/react-router";
import { TicketPercent } from "lucide-react";

import { EmptyState, PageHeader } from "@/components/admin/primitives";

export const Route = createFileRoute("/discounts")({
  head: () => ({
    meta: [
      { title: "Discounts · Tavelo Super Admin" },
      { name: "description", content: "Subscription discounts and promotional pricing." },
    ],
  }),
  component: DiscountsPage,
});

function DiscountsPage() {
  // Discounts are represented on invoices today; there is no dedicated discount
  // endpoint yet, so this page stays empty rather than inventing records.
  return (
    <div className="space-y-5">
      <PageHeader
        title="Discounts"
        description="Promotional pricing applied to subscriptions and invoices."
      />
      <div className="panel">
        <EmptyState
          icon={TicketPercent}
          title="Discounts not available yet"
          description="Invoice-level discounts are visible on each invoice. A dedicated discount catalogue is not yet exposed by the platform API."
        />
      </div>
    </div>
  );
}
