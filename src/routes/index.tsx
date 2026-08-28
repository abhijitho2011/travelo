import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowUpRight, CalendarDays, Download, Plus } from "lucide-react";
import { useState } from "react";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Legend, Line, LineChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { KpiCard, PageHeader, Section, StatusBadge, Timeline } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  activityFeed, alerts, growthSeries, kpis, platformUsage, revenueSeries, subscriptionHealth,
} from "@/lib/travelo-data";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "Platform Dashboard · Travelo Super Admin" },
      {
        name: "description",
        content:
          "Executive view of Travelo platform health: owners, properties, rooms, MRR, ARR, subscription health and live usage.",
      },
      { property: "og:title", content: "Platform Dashboard · Travelo Super Admin" },
      {
        property: "og:description",
        content: "Owners, properties, MRR/ARR, subscription health and platform usage in one control plane.",
      },
    ],
  }),
  component: Dashboard,
});

const chartTooltip = {
  contentStyle: {
    background: "var(--color-surface)",
    border: "1px solid var(--color-border)",
    borderRadius: "8px",
    fontSize: "12px",
  },
};

function Dashboard() {
  const [range, setRange] = useState("30d");
  const healthTotal = subscriptionHealth.reduce((a, b) => a + b.value, 0);

  return (
    <>
      <PageHeader
        eyebrow="Overview"
        title="Platform Dashboard"
        description="Live state of the Travelo platform — customers, revenue, subscriptions and system load."
        actions={
          <>
            <Select value={range} onValueChange={setRange}>
              <SelectTrigger className="h-8 w-[168px] text-sm" aria-label="Date range">
                <CalendarDays aria-hidden className="mr-1.5 size-3.5" />
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="today">Today</SelectItem>
                <SelectItem value="yesterday">Yesterday</SelectItem>
                <SelectItem value="7d">Last 7 days</SelectItem>
                <SelectItem value="30d">Last 30 days</SelectItem>
                <SelectItem value="month">This month</SelectItem>
                <SelectItem value="lastmonth">Last month</SelectItem>
                <SelectItem value="quarter">This quarter</SelectItem>
                <SelectItem value="year">This year</SelectItem>
                <SelectItem value="custom">Custom range…</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" className="h-8">
              <Download aria-hidden className="mr-1.5 size-3.5" /> Export
            </Button>
            <Button asChild size="sm" className="h-8">
              <Link to="/owners/new">
                <Plus aria-hidden className="mr-1.5 size-3.5" /> Add owner
              </Link>
            </Button>
          </>
        }
      />

      <div className="space-y-4 p-4 lg:p-6">
        {/* Alert center */}
        <Section title="Platform alert center" description="Clicking an alert opens the filtered screen.">
          <ul className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-5">
            {alerts.map((a) => (
              <li key={a.text} className="bg-surface">
                <Link
                  to={a.to}
                  className="flex h-full items-start gap-2 px-3.5 py-3 text-sm hover:bg-surface-muted"
                >
                  <span
                    aria-hidden
                    className={cn(
                      "mt-1 size-2.5 shrink-0 rounded-full",
                      a.tone === "danger" && "bg-destructive",
                      a.tone === "warning" && "bg-warning",
                      a.tone === "success" && "bg-success",
                    )}
                  />
                  <span className="text-foreground">{a.text}</span>
                  <ArrowUpRight aria-hidden className="ml-auto size-3.5 shrink-0 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        </Section>

        {/* KPI row */}
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4 xl:grid-cols-8">
          {kpis.map((k) => (
            <KpiCard key={k.label} {...k} />
          ))}
        </div>

        {/* Revenue + subscription health */}
        <div className="grid gap-4 xl:grid-cols-3">
          <Section
            className="xl:col-span-2"
            title="Revenue"
            description="MRR, ARR and collected revenue"
            actions={
              <Tabs defaultValue="mrr">
                <TabsList className="h-8">
                  <TabsTrigger value="mrr" className="text-xs">MRR</TabsTrigger>
                  <TabsTrigger value="arr" className="text-xs">ARR</TabsTrigger>
                  <TabsTrigger value="collected" className="text-xs">Collected</TabsTrigger>
                </TabsList>
              </Tabs>
            }
          >
            <div className="h-[264px] p-3">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueSeries}>
                  <defs>
                    <linearGradient id="mrrFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--color-chart-1)" stopOpacity={0.28} />
                      <stop offset="100%" stopColor="var(--color-chart-1)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} stroke="var(--color-muted-foreground)" />
                  <YAxis
                    tickLine={false}
                    axisLine={false}
                    fontSize={11}
                    stroke="var(--color-muted-foreground)"
                    tickFormatter={(v: number) => `₹${(v / 100000).toFixed(0)}L`}
                  />
                  <Tooltip {...chartTooltip} formatter={(v: number) => `₹${(v / 100000).toFixed(2)}L`} />
                  <Area type="monotone" dataKey="mrr" stroke="var(--color-chart-1)" strokeWidth={2} fill="url(#mrrFill)" name="MRR" />
                  <Line type="monotone" dataKey="collected" stroke="var(--color-chart-3)" strokeWidth={2} dot={false} name="Collected" />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Section>

          <Section title="Subscription health" description={`${healthTotal} total subscriptions`}>
            <div className="p-4">
              <div className="mb-4 flex h-2 overflow-hidden rounded-full">
                {subscriptionHealth.map((s) => (
                  <span
                    key={s.label}
                    title={`${s.label}: ${s.value}`}
                    style={{ width: `${(s.value / healthTotal) * 100}%` }}
                    className={cn(
                      s.tone === "success" && "bg-success",
                      s.tone === "info" && "bg-info",
                      s.tone === "warning" && "bg-warning",
                      s.tone === "danger" && "bg-destructive",
                      s.tone === "neutral" && "bg-border-strong",
                    )}
                  />
                ))}
              </div>
              <ul className="space-y-1.5">
                {subscriptionHealth.map((s) => (
                  <li key={s.label}>
                    <Link
                      to="/subscriptions"
                      className="flex items-center justify-between rounded px-1 py-1 text-sm hover:bg-surface-muted"
                    >
                      <StatusBadge status={s.label} tone={s.tone} />
                      <span className="tnum font-semibold">{s.value}</span>
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          </Section>
        </div>

        {/* Growth + usage */}
        <div className="grid gap-4 xl:grid-cols-3">
          <Section className="xl:col-span-2" title="Customer growth" description="New owners, new properties and churn">
            <div className="h-[240px] p-3">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={growthSeries}>
                  <CartesianGrid stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} stroke="var(--color-muted-foreground)" />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="var(--color-muted-foreground)" />
                  <Tooltip {...chartTooltip} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="owners" name="New owners" fill="var(--color-chart-1)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="properties" name="New properties" fill="var(--color-chart-2)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="churned" name="Churned owners" fill="var(--color-chart-5)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>

          <Section title="Platform usage" description="Last 24 hours">
            <ul className="grid grid-cols-2 gap-px bg-border">
              {platformUsage.map((u) => (
                <li key={u.label} className="bg-surface px-3 py-2.5">
                  <p className="eyebrow truncate">{u.label}</p>
                  <p className="tnum text-base font-bold">{u.value}</p>
                  <p className="truncate text-[11px] text-muted-foreground">{u.sub}</p>
                </li>
              ))}
            </ul>
          </Section>
        </div>

        {/* Activity + expiring */}
        <div className="grid gap-4 xl:grid-cols-3">
          <Section
            className="xl:col-span-2"
            title="Owner activity"
            actions={
              <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                <Link to="/activity">View all</Link>
              </Button>
            }
          >
            <div className="px-4 py-2">
              <Timeline items={activityFeed.slice(0, 6)} />
            </div>
          </Section>

          <Section
            title="Trend — MRR vs churn"
            description="Rolling 9 months"
          >
            <div className="h-[240px] p-3">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={revenueSeries}>
                  <CartesianGrid stroke="var(--color-border)" vertical={false} />
                  <XAxis dataKey="month" tickLine={false} axisLine={false} fontSize={11} stroke="var(--color-muted-foreground)" />
                  <YAxis tickLine={false} axisLine={false} fontSize={11} stroke="var(--color-muted-foreground)" tickFormatter={(v: number) => `₹${(v / 10000000).toFixed(1)}Cr`} />
                  <Tooltip {...chartTooltip} formatter={(v: number) => `₹${(v / 100000).toFixed(1)}L`} />
                  <Line type="monotone" dataKey="arr" name="ARR" stroke="var(--color-chart-2)" strokeWidth={2} dot={false} />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </Section>
        </div>
      </div>
    </>
  );
}
