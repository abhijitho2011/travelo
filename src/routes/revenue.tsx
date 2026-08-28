import { createFileRoute } from "@tanstack/react-router";
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, Pie, PieChart,
  ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";

import { PageHeader, Section } from "@/components/admin/primitives";
import { DataTable, type Column } from "@/components/admin/data-table";
import { growthSeries, inr, revenueByPlan, revenueSeries, saasMetrics } from "@/lib/travelo-data";

export const Route = createFileRoute("/revenue")({
  head: () => ({
    meta: [
      { title: "Revenue Analytics · Travelo Super Admin" },
      { name: "description", content: "MRR, ARR, ARPU, expansion and churn analytics for the Travelo hotel SaaS platform." },
      { property: "og:title", content: "Revenue Analytics · Travelo Super Admin" },
      { property: "og:description", content: "SaaS revenue performance across plans and regions." },
    ],
  }),
  component: RevenuePage,
});

const pieColors = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)"];

type PlanRow = (typeof revenueByPlan)[number];

function RevenuePage() {
  const columns: Column<PlanRow>[] = [
    { key: "plan", header: "Plan", cell: (r) => <span className="font-semibold">{r.plan}</span> },
    { key: "customers", header: "Customers", align: "right", sortValue: (r) => r.customers, cell: (r) => <span className="tnum">{r.customers}</span> },
    { key: "mrr", header: "MRR", align: "right", sortValue: (r) => r.mrr, cell: (r) => <span className="tnum">{inr(r.mrr)}</span> },
    { key: "arr", header: "ARR", align: "right", cell: (r) => <span className="tnum">{inr(r.mrr * 12)}</span> },
    { key: "arpu", header: "ARPU", align: "right", cell: (r) => <span className="tnum">{inr(Math.round(r.mrr / r.customers))}</span> },
    {
      key: "share", header: "Revenue share", align: "right",
      cell: (r) => {
        const total = revenueByPlan.reduce((s, x) => s + x.mrr, 0);
        return <span className="tnum">{((r.mrr / total) * 100).toFixed(1)}%</span>;
      },
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Monetization"
        title="Revenue Analytics"
        description="Recurring revenue performance, plan mix and retention economics."
        breadcrumbs={[{ label: "Super Admin", to: "/" }, { label: "Revenue" }]}
      />
      <div className="space-y-4 p-4 lg:p-6">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-4 xl:grid-cols-8">
          {saasMetrics.map((m) => (
            <div key={m.label} className="bg-surface p-3.5">
              <p className="eyebrow truncate">{m.label}</p>
              <p className="tnum mt-1 text-xl font-bold text-foreground">{m.value}</p>
              <p className={`tnum text-xs font-semibold ${m.delta.startsWith("-") ? "text-warning" : "text-success"}`}>{m.delta}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-4 xl:grid-cols-3">
          <Section title="Recurring revenue trend" description="MRR vs collected cash, last 9 months" className="xl:col-span-2">
            <div className="h-[300px] p-4">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={revenueSeries}>
                  <defs>
                    <linearGradient id="mrrFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.35} />
                      <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" tickFormatter={(v: number) => `${Math.round(v / 100000)}L`} />
                  <Tooltip
                    contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => inr(v)}
                  />
                  <Area type="monotone" dataKey="mrr" name="MRR" stroke="var(--chart-1)" strokeWidth={2} fill="url(#mrrFill)" />
                  <Area type="monotone" dataKey="collected" name="Collected" stroke="var(--chart-2)" strokeWidth={2} fill="transparent" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </Section>

          <Section title="Revenue by plan" description="Share of monthly recurring revenue">
            <div className="h-[300px] p-4">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={revenueByPlan} dataKey="mrr" nameKey="plan" innerRadius={58} outerRadius={92} paddingAngle={2}>
                    {revenueByPlan.map((entry, i) => (
                      <Cell key={entry.plan} fill={pieColors[i % pieColors.length]} />
                    ))}
                  </Pie>
                  <Tooltip
                    contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                    formatter={(v: number) => inr(v)}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </Section>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Section title="Acquisition vs churn" description="New vs churned owner accounts per month">
            <div className="h-[260px] p-4">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={growthSeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                  <XAxis dataKey="month" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                  <Tooltip
                    contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }}
                  />
                  <Bar dataKey="owners" name="New owners" fill="var(--chart-2)" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="churned" name="Churned owners" fill="var(--chart-5)" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </Section>

          <Section title="Plan performance">
            <DataTable
              rows={revenueByPlan}
              columns={columns}
              rowKey={(r) => r.plan}
              pageSize={6}
              exportName="RevenueByPlan"
              emptyTitle="No revenue data"
              emptyDescription="Revenue appears once subscriptions are active."
            />
          </Section>
        </div>
      </div>
    </>
  );
}
