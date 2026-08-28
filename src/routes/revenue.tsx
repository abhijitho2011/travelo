import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  AsyncSection,
  ChartSkeleton,
  KpiCard,
  PageHeader,
  Section,
} from "@/components/admin/primitives";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useAnalyticsOverview, useRevenueSeries } from "@/hooks/api/use-analytics";
import { useRefunds } from "@/hooks/api/use-billing";
import { compactInr, formatDate, inr, num } from "@/lib/format";

export const Route = createFileRoute("/revenue")({
  head: () => ({
    meta: [
      { title: "Revenue · Tavelo Super Admin" },
      { name: "description", content: "MRR, ARR and revenue movement across the platform." },
    ],
  }),
  component: RevenuePage,
});

function isoDaysAgo(days: number) {
  return new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10);
}

function RevenuePage() {
  const [from, setFrom] = useState(isoDaysAgo(180));
  const [to, setTo] = useState(new Date().toISOString().slice(0, 10));

  const overview = useAnalyticsOverview();
  const series = useRevenueSeries(from, to);
  const refunds = useRefunds({ limit: 10 });

  const points = series.data ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Monetization"
        title="Revenue"
        description="Recurring revenue, movement and refunds across the platform."
        actions={
          <div className="flex flex-wrap items-end gap-2">
            <div className="space-y-1">
              <Label htmlFor="rev-from" className="text-xs">
                From
              </Label>
              <Input
                id="rev-from"
                type="date"
                className="h-8 w-[150px]"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="rev-to" className="text-xs">
                To
              </Label>
              <Input
                id="rev-to"
                type="date"
                className="h-8 w-[150px]"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
        }
      />

      <div className="space-y-4 p-5 lg:p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {overview.isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[86px] w-full rounded-lg" />
              ))
            : [
                { label: "MRR", value: compactInr(overview.data?.mrr) },
                { label: "ARR", value: compactInr(overview.data?.arr) },
                { label: "ARPU", value: inr(overview.data?.arpu) },
                { label: "Active subscriptions", value: num(overview.data?.subsActive) },
              ].map((kpi) => <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} />)}
        </div>

        <Section title="MRR and ARR" description="Daily platform metrics for the selected range">
          <div className="p-4">
            <AsyncSection
              loading={series.isLoading}
              error={series.error}
              onRetry={() => series.refetch()}
              isEmpty={points.length === 0}
              emptyTitle="No metrics in this range"
              emptyDescription="Widen the date range, or wait for the daily metrics job to run."
              skeleton={<ChartSkeleton height={300} />}
            >
              <ResponsiveContainer width="100%" height={300}>
                <LineChart data={points} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="var(--color-border)"
                    vertical={false}
                  />
                  <XAxis
                    dataKey="day"
                    tickFormatter={(v: string) => formatDate(v).slice(0, 6)}
                    tick={{ fontSize: 11 }}
                    stroke="var(--color-muted-foreground)"
                    minTickGap={24}
                  />
                  <YAxis
                    tickFormatter={(v: number) => compactInr(v)}
                    tick={{ fontSize: 11 }}
                    stroke="var(--color-muted-foreground)"
                    width={80}
                  />
                  <Tooltip
                    formatter={(value: number) => inr(value)}
                    labelFormatter={(label: string) => formatDate(label)}
                  />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="mrr"
                    name="MRR"
                    stroke="var(--color-primary)"
                    strokeWidth={2}
                    dot={false}
                  />
                  <Line
                    type="monotone"
                    dataKey="arr"
                    name="ARR"
                    stroke="var(--color-info)"
                    strokeWidth={2}
                    dot={false}
                  />
                </LineChart>
              </ResponsiveContainer>
            </AsyncSection>
          </div>
        </Section>

        <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]">
          <Section title="Revenue movement" description="New, expansion and churned MRR">
            <div className="p-4">
              <AsyncSection
                loading={series.isLoading}
                error={series.error}
                onRetry={() => series.refetch()}
                isEmpty={points.length === 0}
                emptyTitle="No movement recorded"
                emptyDescription="New, expansion and churn are recorded daily once billing runs."
                skeleton={<ChartSkeleton height={260} />}
              >
                <ResponsiveContainer width="100%" height={260}>
                  <BarChart data={points} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="var(--color-border)"
                      vertical={false}
                    />
                    <XAxis
                      dataKey="day"
                      tickFormatter={(v: string) => formatDate(v).slice(0, 6)}
                      tick={{ fontSize: 11 }}
                      stroke="var(--color-muted-foreground)"
                      minTickGap={24}
                    />
                    <YAxis
                      tickFormatter={(v: number) => compactInr(v)}
                      tick={{ fontSize: 11 }}
                      stroke="var(--color-muted-foreground)"
                      width={80}
                    />
                    <Tooltip formatter={(value: number) => inr(value)} />
                    <Legend />
                    <Bar dataKey="newMrr" name="New" fill="var(--color-success)" />
                    <Bar dataKey="expansionMrr" name="Expansion" fill="var(--color-info)" />
                    <Bar dataKey="churnedMrr" name="Churned" fill="var(--color-destructive)" />
                  </BarChart>
                </ResponsiveContainer>
              </AsyncSection>
            </div>
          </Section>

          <Section title="Recent refunds">
            <div className="px-4 py-2">
              <AsyncSection
                loading={refunds.isLoading}
                error={refunds.error}
                onRetry={() => refunds.refetch()}
                isEmpty={(refunds.data?.items?.length ?? 0) === 0}
                emptyTitle="No refunds"
                emptyDescription="Refunds issued from the payments screen appear here."
              >
                <ul className="divide-y divide-border">
                  {refunds.data?.items?.map((r) => (
                    <li key={r.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="tnum text-sm font-semibold">{inr(r.amount)}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {r.reason ?? "No reason recorded"} · {formatDate(r.createdAt)}
                        </p>
                      </div>
                      <span className="text-xs text-muted-foreground">{r.status}</span>
                    </li>
                  ))}
                </ul>
              </AsyncSection>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
