import { createFileRoute } from "@tanstack/react-router";

import { AsyncSection, KpiCard, PageHeader } from "@/components/admin/primitives";
import { useAnalyticsOverview } from "@/hooks/api/use-analytics";
import { num } from "@/lib/format";

export const Route = createFileRoute("/usage")({
  head: () => ({
    meta: [
      { title: "Usage · Tavelo Super Admin" },
      { name: "description", content: "Platform-wide usage of Tavelo across owners and hotels." },
    ],
  }),
  component: UsagePage,
});

function UsagePage() {
  const query = useAnalyticsOverview();
  const data = query.data;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Usage"
        description="How much of the platform is in active use across all customer accounts."
      />

      <AsyncSection
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        isEmpty={!data}
        emptyTitle="No usage data"
        emptyDescription="Usage metrics appear once owners begin operating on Tavelo."
      >
        {data && (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <KpiCard label="Owners" value={num(data.ownersTotal)} hint="Total accounts" />
            <KpiCard label="Active owners" value={num(data.ownersActive)} hint="Currently active" />
            <KpiCard label="Properties" value={num(data.propertiesTotal)} hint="Hotels onboarded" />
            <KpiCard label="Rooms" value={num(data.rooms)} hint="Across all hotels" />
            <KpiCard
              label="Active subscriptions"
              value={num(data.subsActive)}
              hint="Currently billable"
            />
            <KpiCard
              label="Expiring soon"
              value={num(data.expiringSoon)}
              hint="Needs renewal attention"
            />
          </div>
        )}
      </AsyncSection>
    </div>
  );
}
