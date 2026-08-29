import { createFileRoute, Link } from "@tanstack/react-router";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { DataTable, type Column } from "@/components/admin/data-table";
import { ExportButton } from "@/components/admin/export-button";
import { ExtendSubscriptionDialog } from "@/components/admin/extend-subscription";
import { StatusFilter, ToolbarActions } from "@/components/admin/list-toolbar";
import { PageHeader, StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import type { Subscription } from "@/hooks/api/types";
import {
  useSubscriptionAction,
  useSubscriptions,
  type SubscriptionAction,
} from "@/hooks/api/use-subscriptions";
import { useListParams } from "@/hooks/use-list-params";
import { errorMessage } from "@/lib/api";
import { formatDate, humanise, inr, num } from "@/lib/format";

export const Route = createFileRoute("/subscriptions")({
  head: () => ({
    meta: [
      { title: "Subscriptions · Tavelo Super Admin" },
      { name: "description", content: "Active, trialling and expiring owner subscriptions." },
    ],
  }),
  component: SubscriptionsPage,
});

const SUBSCRIPTION_STATUSES = [
  "ACTIVE",
  "TRIAL",
  "EXPIRING",
  "GRACE_PERIOD",
  "SUSPENDED",
  "CANCELLED",
  "EXPIRED",
];

function SubscriptionActions({ subscription }: { subscription: Subscription }) {
  const action = useSubscriptionAction();
  const label = subscription.owner ?? "Subscription";

  const run = async (name: SubscriptionAction, reason: string) => {
    try {
      await action.mutateAsync({ id: subscription.id, action: name, reason });
      toast.success(`Subscription ${name}d`, { description: `${label} updated.` });
    } catch (error) {
      toast.error(`Could not ${name} subscription`, { description: errorMessage(error) });
    }
  };

  return (
    <div className="flex items-center justify-end gap-1">
      <ExtendSubscriptionDialog subscription={subscription} variant="outline" />
      {subscription.status === "SUSPENDED" ? (
        <ConfirmDialog
          destructive={false}
          confirmLabel="Reactivate"
          title="Reactivate subscription"
          description={`${label} will return to active billing.`}
          onConfirm={(reason) => run("reactivate", reason)}
          trigger={
            <Button variant="ghost" size="sm" className="h-7 text-xs">
              Reactivate
            </Button>
          }
        />
      ) : (
        <ConfirmDialog
          confirmLabel="Suspend"
          title="Suspend subscription"
          description={`${label} will be suspended immediately.`}
          impact={["Owner portal access is restricted", "Billing pauses until reactivated"]}
          onConfirm={(reason) => run("suspend", reason)}
          trigger={
            <Button variant="ghost" size="sm" className="h-7 text-xs">
              Suspend
            </Button>
          }
        />
      )}
      <ConfirmDialog
        confirmLabel="Cancel subscription"
        title="Cancel subscription"
        description={`${label}'s subscription will be cancelled.`}
        impact={["No further renewals", "Access ends at the current period end"]}
        onConfirm={(reason) => run("cancel", reason)}
        trigger={
          <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive">
            Cancel
          </Button>
        }
      />
    </div>
  );
}

function SubscriptionsPage() {
  const list = useListParams();
  const query = useSubscriptions({
    limit: list.limit,
    offset: list.offset,
    status: list.statusParam,
  });

  const columns: Column<Subscription>[] = [
    {
      key: "owner",
      header: "Owner",
      cell: (s) => (
        <Link
          to="/owners/$ownerId"
          params={{ ownerId: s.ownerId }}
          className="font-medium text-primary hover:underline"
        >
          {s.owner ?? s.ownerId}
        </Link>
      ),
    },
    { key: "plan", header: "Plan", cell: (s) => s.plan },
    { key: "status", header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
    { key: "cycle", header: "Cycle", cell: (s) => humanise(s.cycle) },
    { key: "limit", header: "Properties", align: "right", cell: (s) => num(s.propertyLimit) },
    {
      key: "override",
      header: "Price override",
      align: "right",
      cell: (s) => (s.priceOverride === null ? "—" : inr(s.priceOverride)),
    },
    { key: "renews", header: "Period ends", cell: (s) => formatDate(s.currentPeriodEnd) },
    { key: "auto", header: "Auto renew", cell: (s) => (s.autoRenew ? "Yes" : "No") },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Monetization"
        title="Subscriptions"
        description="Extend, suspend, reactivate or cancel owner subscriptions."
      />
      <div className="p-5 lg:p-6">
        <DataTable
          rows={query.data?.items ?? []}
          columns={columns}
          rowKey={(s) => s.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          rowActions={(s) => <SubscriptionActions subscription={s} />}
          emptyTitle="No subscriptions match this view"
          emptyDescription="Change the status filter, or subscribe an owner to a plan."
          pagination={{
            total: query.data?.total ?? 0,
            limit: list.limit,
            offset: list.offset,
            onOffsetChange: list.setOffset,
          }}
          toolbar={
            <>
              <StatusFilter
                value={list.status}
                onChange={list.setStatus}
                options={SUBSCRIPTION_STATUSES}
              />
              <ToolbarActions>
                <span className="tnum text-xs text-muted-foreground">
                  {query.data?.total ?? 0} total
                </span>
                <ExportButton entity="subscriptions" filters={{ status: list.statusParam }} />
              </ToolbarActions>
            </>
          }
        />
      </div>
    </>
  );
}
