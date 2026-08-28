import { createFileRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  Cell,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";

import {
  AsyncSection,
  ChartSkeleton,
  ErrorState,
  KpiCard,
  PageHeader,
  Section,
  StatusBadge,
} from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useDashboard } from "@/hooks/api/use-analytics";
import { useFailedPayments } from "@/hooks/api/use-billing";
import { useTickets } from "@/hooks/api/use-support";
import { compactInr, formatDate, humanise, inr, num, relativeTime } from "@/lib/format";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Dashboard · Tavelo Super Admin" },
      { name: "description", content: "Platform-wide KPIs, revenue trend and operational alerts." },
    ],
  }),
  component: DashboardPage,
});

const TONE_COLORS = [
  "var(--color-primary)",
  "var(--color-info)",
  "var(--color-success)",
  "var(--color-warning)",
  "var(--color-destructive)",
];

function DashboardPage() {
  const dashboard = useDashboard();
  const failed = useFailedPayments(5);
  const openTickets = useTickets({ limit: 5, status: "OPEN" });

  const overview = dashboard.data?.overview;
  const series = dashboard.data?.revenueSeries ?? [];
  const health = dashboard.data?.subscriptionHealth ?? [];
  const owners = dashboard.data?.ownerBreakdown ?? [];

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Platform dashboard"
        description="Live owners, subscriptions, revenue and operational signals."
        actions={
          <Button asChild size="sm" className="h-8">
            <Link to="/owners/new">
              <Plus aria-hidden className="mr-1.5 size-3.5" /> New owner
            </Link>
          </Button>
        }
      />

      <div className="space-y-4 p-5 lg:p-6">
        {dashboard.isError ? (
          <div className="panel">
            <ErrorState
              description={
                dashboard.error instanceof Error
                  ? dashboard.error.message
                  : "The dashboard could not be loaded."
              }
              onRetry={() => dashboard.refetch()}
            />
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {dashboard.isLoading
              ? Array.from({ length: 8 }).map((_, i) => (
                  <Skeleton key={i} className="h-[86px] w-full rounded-lg" />
                ))
              : [
                  { label: "Total owners", value: num(overview?.ownersTotal) },
                  { label: "Active owners", value: num(overview?.ownersActive) },
                  { label: "Properties", value: num(overview?.propertiesTotal) },
                  { label: "Rooms managed", value: num(overview?.rooms) },
                  { label: "Active subscriptions", value: num(overview?.subsActive) },
                  { label: "MRR", value: compactInr(overview?.mrr) },
                  { label: "ARR", value: compactInr(overview?.arr) },
                  {
                    label: "Expiring soon",
                    value: num(overview?.expiringSoon),
                    hint: "next 7 days",
                  },
                ].map((kpi) => (
                  <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} hint={kpi.hint} />
                ))}
          </div>
        )}

        <div className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
          <Section title="Revenue trend" description="Daily MRR recorded by the platform">
            <div className="p-4">
              <AsyncSection
                loading={dashboard.isLoading}
                error={dashboard.error}
                onRetry={() => dashboard.refetch()}
                isEmpty={series.length === 0}
                emptyTitle="No revenue history yet"
                emptyDescription="Daily platform metrics are recorded once subscriptions start billing."
                skeleton={<ChartSkeleton height={260} />}
              >
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={series} margin={{ left: 4, right: 8, top: 8, bottom: 0 }}>
                    <defs>
                      <linearGradient id="mrrFill" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-primary)" stopOpacity={0.35} />
                        <stop offset="100%" stopColor="var(--color-primary)" stopOpacity={0} />
                      </linearGradient>
                    </defs>
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
                      width={70}
                    />
                    <Tooltip
                      formatter={(value: number) => inr(value)}
                      labelFormatter={(label: string) => formatDate(label)}
                    />
                    <Area
                      type="monotone"
                      dataKey="mrr"
                      name="MRR"
                      stroke="var(--color-primary)"
                      fill="url(#mrrFill)"
                      strokeWidth={2}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </AsyncSection>
            </div>
          </Section>

          <Section title="Subscription health" description="Live status distribution">
            <div className="p-4">
              <AsyncSection
                loading={dashboard.isLoading}
                error={dashboard.error}
                onRetry={() => dashboard.refetch()}
                isEmpty={health.length === 0}
                emptyTitle="No subscriptions yet"
                emptyDescription="Status distribution appears once owners are subscribed."
                skeleton={<ChartSkeleton height={200} />}
              >
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={health}
                      dataKey="count"
                      nameKey="status"
                      innerRadius={50}
                      outerRadius={80}
                      paddingAngle={2}
                    >
                      {health.map((entry, i) => (
                        <Cell key={entry.status} fill={TONE_COLORS[i % TONE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number, n: string) => [num(v), humanise(n)]} />
                  </PieChart>
                </ResponsiveContainer>
                <ul className="mt-3 space-y-1.5">
                  {health.map((h, i) => (
                    <li key={h.status} className="flex items-center justify-between text-sm">
                      <span className="flex items-center gap-2">
                        <span
                          aria-hidden
                          className="size-2 rounded-full"
                          style={{ background: TONE_COLORS[i % TONE_COLORS.length] }}
                        />
                        {humanise(h.status)}
                      </span>
                      <span className="tnum font-semibold">{num(h.count)}</span>
                    </li>
                  ))}
                </ul>
              </AsyncSection>
            </div>
          </Section>
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Section title="Owner status" description="Accounts by lifecycle state">
            <div className="px-4 py-3">
              <AsyncSection
                loading={dashboard.isLoading}
                error={dashboard.error}
                onRetry={() => dashboard.refetch()}
                isEmpty={owners.length === 0}
                emptyTitle="No owners yet"
                emptyDescription="Create the first owner to populate this breakdown."
              >
                <ul className="divide-y divide-border">
                  {owners.map((o) => (
                    <li key={o.status} className="flex items-center justify-between py-2">
                      <StatusBadge status={o.status} />
                      <span className="tnum text-sm font-semibold">{num(o.count)}</span>
                    </li>
                  ))}
                </ul>
              </AsyncSection>
            </div>
          </Section>

          <Section
            title="Failed payments"
            description="Needs collections follow-up"
            actions={
              <Button asChild variant="outline" size="sm" className="h-7">
                <Link to="/payments">View all</Link>
              </Button>
            }
          >
            <div className="px-4 py-3">
              <AsyncSection
                loading={failed.isLoading}
                error={failed.error}
                onRetry={() => failed.refetch()}
                isEmpty={(failed.data?.items?.length ?? 0) === 0}
                emptyTitle="No failed payments"
                emptyDescription="Every recent charge has settled successfully."
              >
                <ul className="divide-y divide-border">
                  {failed.data?.items?.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium">{p.owner ?? "Unknown owner"}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {p.failureReason ?? humanise(p.status)} · {relativeTime(p.createdAt)}
                        </p>
                      </div>
                      <span className="tnum shrink-0 text-sm font-semibold">{inr(p.amount)}</span>
                    </li>
                  ))}
                </ul>
              </AsyncSection>
            </div>
          </Section>

          <Section
            title="Open tickets"
            description="Awaiting a first response"
            actions={
              <Button asChild variant="outline" size="sm" className="h-7">
                <Link to="/support">View all</Link>
              </Button>
            }
          >
            <div className="px-4 py-3">
              <AsyncSection
                loading={openTickets.isLoading}
                error={openTickets.error}
                onRetry={() => openTickets.refetch()}
                isEmpty={(openTickets.data?.items?.length ?? 0) === 0}
                emptyTitle="Inbox zero"
                emptyDescription="There are no open support tickets right now."
              >
                <ul className="divide-y divide-border">
                  {openTickets.data?.items?.map((t) => (
                    <li key={t.id} className="py-2">
                      <Link
                        to="/support/$ticketId"
                        params={{ ticketId: t.id }}
                        className="block hover:underline"
                      >
                        <p className="truncate text-sm font-medium">{t.subject}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {t.owner ?? "Unassigned owner"} · {relativeTime(t.createdAt)}
                        </p>
                      </Link>
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
