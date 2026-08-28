import { createFileRoute } from "@tanstack/react-router";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { KpiCard, PageHeader, Section, StatusBadge, Timeline } from "@/components/admin/primitives";
import { systemComponents } from "@/lib/travelo-data";

export const Route = createFileRoute("/system-health")({
  head: () => ({
    meta: [
      { title: "System Health · Travelo Super Admin" },
      { name: "description", content: "Uptime, latency, error rates and component status for the Travelo hotel management platform." },
      { property: "og:title", content: "System Health · Travelo Super Admin" },
      { property: "og:description", content: "Technical monitoring of the Travelo platform." },
    ],
  }),
  component: SystemHealthPage,
});

const latency = Array.from({ length: 24 }, (_, i) => ({
  hour: `${String(i).padStart(2, "0")}:00`,
  p95: 120 + Math.round(Math.sin(i / 3) * 28) + (i > 18 ? 22 : 0),
  errors: Math.max(0, Math.round(Math.cos(i / 4) * 6) + (i === 14 ? 18 : 2)),
}));

function SystemHealthPage() {
  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="System Health"
        description="Platform reliability at a glance — components, latency, error rates and incidents."
        breadcrumbs={[{ label: "Super Admin", to: "/" }, { label: "System Health" }]}
      />
      <div className="space-y-4 p-4 lg:p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
          <KpiCard label="Uptime (30d)" value="99.98%" delta="SLA met" />
          <KpiCard label="API latency p95" value="142 ms" delta="-8 ms" />
          <KpiCard label="Error rate" value="0.02%" delta="stable" />
          <KpiCard label="Queue backlog" value="2,140" trend="down" delta="notifications" />
          <KpiCard label="Open incidents" value="1" trend="down" delta="1 degraded" />
        </div>

        <Section title="Component status" description="Live status of every platform subsystem">
          <ul className="grid gap-px bg-border sm:grid-cols-2 xl:grid-cols-3">
            {systemComponents.map((c) => (
              <li key={c.name} className="flex items-start justify-between gap-3 bg-surface px-4 py-3">
                <span className="min-w-0">
                  <span className="block truncate text-sm font-semibold">{c.name}</span>
                  <span className="tnum block text-xs text-muted-foreground">{c.metric} · {c.sub}</span>
                </span>
                <StatusBadge status={c.status} />
              </li>
            ))}
          </ul>
        </Section>

        <Section title="Latency and errors" description="Last 24 hours, API gateway">
          <div className="h-[280px] p-4">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={latency}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="hour" tick={{ fontSize: 10 }} stroke="var(--muted-foreground)" interval={3} />
                <YAxis yAxisId="l" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis yAxisId="r" orientation="right" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Line yAxisId="l" type="monotone" dataKey="p95" name="p95 latency (ms)" stroke="var(--chart-1)" strokeWidth={2} dot={false} />
                <Line yAxisId="r" type="monotone" dataKey="errors" name="Errors" stroke="var(--chart-5)" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <div className="grid gap-4 xl:grid-cols-2">
          <Section title="Incident history">
            <div className="px-4 py-2">
              <Timeline
                items={[
                  { time: "in progress", text: "Notification queue backlog — WhatsApp provider degradation", actor: "Nishant Kumar", tone: "warning" },
                  { time: "yesterday 21:40", text: "Booking engine CDN cache purge caused elevated latency (18 min)", actor: "Resolved", tone: "success" },
                  { time: "24 Aug", text: "PostgreSQL failover test completed with 12s read-only window", actor: "Planned", tone: "info" },
                  { time: "17 Aug", text: "Channex API rate limit breach — retry policy tuned", actor: "Resolved", tone: "success" },
                ]}
              />
            </div>
          </Section>
          <Section title="Capacity headroom">
            <ul className="divide-y divide-border">
              {[
                { label: "Database connections", value: "214 / 500", note: "43% used" },
                { label: "Object storage", value: "8.7 TB / 20 TB", note: "44% used" },
                { label: "Worker concurrency", value: "180 / 320", note: "56% used" },
                { label: "WebSocket sessions", value: "9,684 / 25,000", note: "39% used" },
                { label: "API quota (daily)", value: "12.4M / 30M", note: "41% used" },
              ].map((r) => (
                <li key={r.label} className="flex items-center justify-between px-4 py-3 text-sm">
                  <span>{r.label}</span>
                  <span className="text-right">
                    <span className="tnum block font-semibold">{r.value}</span>
                    <span className="block text-xs text-muted-foreground">{r.note}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      </div>
    </>
  );
}
