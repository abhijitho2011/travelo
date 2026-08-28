import { createFileRoute } from "@tanstack/react-router";
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

import { DataTable, type Column } from "@/components/admin/data-table";
import { PageHeader, Section } from "@/components/admin/primitives";
import { platformUsage, usageByOwner } from "@/lib/travelo-data";

export const Route = createFileRoute("/usage")({
  head: () => ({
    meta: [
      { title: "Platform Usage · Travelo Super Admin" },
      { name: "description", content: "Reservations, check-ins, API traffic, channel syncs and storage consumption across the Travelo platform." },
      { property: "og:title", content: "Platform Usage · Travelo Super Admin" },
      { property: "og:description", content: "Aggregate platform usage and per-owner consumption." },
    ],
  }),
  component: UsagePage,
});

const trafficSeries = Array.from({ length: 14 }, (_, i) => ({
  day: `${i + 15} Aug`,
  reservations: 3200 + Math.round(Math.sin(i / 2) * 480) + i * 26,
  checkins: 2900 + Math.round(Math.cos(i / 2) * 380) + i * 18,
  api: 11.2 + i * 0.11,
}));

type UsageRow = (typeof usageByOwner)[number];

function UsagePage() {
  const columns: Column<UsageRow>[] = [
    { key: "owner", header: "Owner", sortValue: (r) => r.owner, cell: (r) => <span className="font-semibold">{r.owner}</span> },
    { key: "props", header: "Properties", align: "right", sortValue: (r) => r.properties, cell: (r) => <span className="tnum">{r.properties}</span> },
    { key: "res", header: "Reservations (30d)", align: "right", sortValue: (r) => r.reservations, cell: (r) => <span className="tnum">{r.reservations.toLocaleString("en-IN")}</span> },
    { key: "api", header: "API requests", align: "right", cell: (r) => <span className="tnum">{r.apiRequests}</span> },
    { key: "syncs", header: "Channel syncs", align: "right", sortValue: (r) => r.syncs, cell: (r) => <span className="tnum">{r.syncs.toLocaleString("en-IN")}</span> },
    { key: "storage", header: "Storage", align: "right", cell: (r) => <span className="tnum">{r.storage}</span> },
    { key: "users", header: "Active users", align: "right", sortValue: (r) => r.activeUsers, cell: (r) => <span className="tnum">{r.activeUsers}</span> },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Platform Usage"
        description="How intensively the platform is being used — capacity planning and fair-use monitoring."
        breadcrumbs={[{ label: "Super Admin", to: "/" }, { label: "Platform Usage" }]}
      />
      <div className="space-y-4 p-4 lg:p-6">
        <div className="grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-border bg-border md:grid-cols-4 xl:grid-cols-8">
          {platformUsage.map((u) => (
            <div key={u.label} className="bg-surface p-3.5">
              <p className="eyebrow truncate">{u.label}</p>
              <p className="tnum mt-1 text-xl font-bold text-foreground">{u.value}</p>
              <p className="truncate text-xs text-muted-foreground">{u.sub}</p>
            </div>
          ))}
        </div>

        <Section title="Reservation and check-in volume" description="Last 14 days across all properties">
          <div className="h-[280px] p-4">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={trafficSeries}>
                <defs>
                  <linearGradient id="resFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.3} />
                    <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0.02} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" vertical={false} />
                <XAxis dataKey="day" tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <YAxis tick={{ fontSize: 11 }} stroke="var(--muted-foreground)" />
                <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 8, fontSize: 12 }} />
                <Area type="monotone" dataKey="reservations" name="Reservations" stroke="var(--chart-1)" strokeWidth={2} fill="url(#resFill)" />
                <Area type="monotone" dataKey="checkins" name="Check-ins" stroke="var(--chart-2)" strokeWidth={2} fill="transparent" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Section>

        <Section title="Consumption by owner" description="Highest-volume accounts in the last 30 days">
          <DataTable
            rows={usageByOwner}
            columns={columns}
            rowKey={(r) => r.owner}
            searchKeys={(r) => r.owner}
            searchPlaceholder="Search owner…"
            exportName="PlatformUsage"
            emptyTitle="No usage recorded"
            emptyDescription="Usage metrics populate as hotels operate on the platform."
          />
        </Section>
      </div>
    </>
  );
}
