import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { KpiCard, PageHeader, Section, Timeline } from "@/components/admin/primitives";
import { DataTable, type Column } from "@/components/admin/data-table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { activityFeed, owners } from "@/lib/travelo-data";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Owner Activity · Travelo Super Admin" },
      { name: "description", content: "Live stream of owner and hotel activity: logins, property changes, subscription events and payments." },
      { property: "og:title", content: "Owner Activity · Travelo Super Admin" },
      { property: "og:description", content: "Owner engagement and activity monitoring." },
    ],
  }),
  component: ActivityPage,
});

type EngagementRow = {
  owner: string; logins: number; lastActive: string; properties: number; adoption: string; risk: string;
};

const engagement: EngagementRow[] = owners.map((o, i) => ({
  owner: o.company,
  logins: 40 - i * 3,
  lastActive: o.lastActive,
  properties: o.properties,
  adoption: `${Math.max(38, 96 - i * 6)}%`,
  risk: ["Expired", "Suspended"].includes(o.status) ? "High" : o.status === "Grace Period" ? "Medium" : "Low",
}));

function ActivityPage() {
  const [scope, setScope] = useState("all");
  const feed = activityFeed.filter((a) => scope === "all" || a.tone === scope);

  const columns: Column<EngagementRow>[] = [
    { key: "owner", header: "Owner", sortValue: (r) => r.owner, cell: (r) => <span className="font-semibold">{r.owner}</span> },
    { key: "logins", header: "Logins (30d)", align: "right", sortValue: (r) => r.logins, cell: (r) => <span className="tnum">{r.logins}</span> },
    { key: "props", header: "Properties", align: "right", cell: (r) => <span className="tnum">{r.properties}</span> },
    { key: "adoption", header: "Module adoption", align: "right", cell: (r) => <span className="tnum">{r.adoption}</span> },
    { key: "last", header: "Last active", cell: (r) => <span className="text-muted-foreground">{r.lastActive}</span> },
    {
      key: "risk", header: "Churn risk",
      cell: (r) => (
        <span className={r.risk === "High" ? "font-semibold text-destructive" : r.risk === "Medium" ? "font-semibold text-warning" : "text-muted-foreground"}>
          {r.risk}
        </span>
      ),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Customers"
        title="Owner Activity"
        description="Engagement signals and a live event stream across the owner base."
        breadcrumbs={[{ label: "Super Admin", to: "/" }, { label: "Owner Activity" }]}
      />
      <div className="space-y-4 p-4 lg:p-6">
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <KpiCard label="Owners active (7d)" value="152" delta="+6" hint="82.6% of base" />
          <KpiCard label="Dormant > 14 days" value="19" trend="down" delta="outreach queue" />
          <KpiCard label="Events today" value="4,912" delta="+11%" />
          <KpiCard label="High churn risk" value="7" trend="down" delta="₹3.1L MRR" />
        </div>

        <div className="grid gap-4 xl:grid-cols-5">
          <Section
            title="Live activity stream"
            description="Owner and system events across all accounts"
            className="xl:col-span-2"
            actions={
              <Select value={scope} onValueChange={setScope}>
                <SelectTrigger className="h-7 w-[130px] text-xs" aria-label="Filter events">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All events</SelectItem>
                  <SelectItem value="success">Successes</SelectItem>
                  <SelectItem value="warning">Warnings</SelectItem>
                  <SelectItem value="danger">Failures</SelectItem>
                  <SelectItem value="info">Changes</SelectItem>
                </SelectContent>
              </Select>
            }
          >
            <div className="px-4 py-2">
              <Timeline items={feed.map((a) => ({ time: a.time, text: a.text, actor: a.actor, owner: a.owner, tone: a.tone }))} />
            </div>
          </Section>

          <Section title="Owner engagement" description="Login frequency, adoption and churn risk" className="xl:col-span-3">
            <DataTable
              rows={engagement}
              columns={columns}
              rowKey={(r) => r.owner}
              searchKeys={(r) => r.owner}
              searchPlaceholder="Search owner…"
              exportName="OwnerEngagement"
              pageSize={7}
              emptyTitle="No activity yet"
              emptyDescription="Engagement metrics appear once owners start using the platform."
            />
          </Section>
        </div>
      </div>
    </>
  );
}
