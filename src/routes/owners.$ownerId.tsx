import { createFileRoute, Link } from "@tanstack/react-router";
import { Building2, UserSearch } from "lucide-react";
import { toast } from "sonner";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { ExtendSubscriptionDialog } from "@/components/admin/extend-subscription";
import {
  AsyncSection,
  DetailGrid,
  ErrorState,
  KpiCard,
  MetricRow,
  PageHeader,
  Section,
  StatusBadge,
} from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import {
  useAddEntitlementOverride,
  useOwnerEntitlements,
  useOwnerOverview,
  useOwnerProperties,
  useRemoveEntitlementOverride,
  useSetOwnerStatus,
  type OwnerStatusAction,
} from "@/hooks/api/use-owners";
import { useFeatureCatalog } from "@/hooks/api/use-plans";
import { useSubscriptions } from "@/hooks/api/use-subscriptions";
import { useTickets } from "@/hooks/api/use-support";
import { errorMessage } from "@/lib/api";
import { compactInr, formatDate, humanise, num, relativeTime } from "@/lib/format";

export const Route = createFileRoute("/owners/$ownerId")({
  head: () => ({
    meta: [
      { title: "Owner · Tavelo Super Admin" },
      { name: "description", content: "Owner account, properties, subscription and entitlements." },
    ],
  }),
  component: OwnerDetailPage,
});

function StatusActions({
  ownerId,
  status,
  label,
}: {
  ownerId: string;
  status: string;
  label: string;
}) {
  const setStatus = useSetOwnerStatus(ownerId);

  const run = async (action: OwnerStatusAction, reason: string) => {
    try {
      await setStatus.mutateAsync({ action, reason });
      toast.success(`Owner ${action}d`, { description: `${label} updated.` });
    } catch (error) {
      toast.error(`Could not ${action} owner`, { description: errorMessage(error) });
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {status !== "ACTIVE" && (
        <ConfirmDialog
          destructive={false}
          confirmLabel="Activate"
          title="Activate owner"
          description={`${label} will regain full access to their portal.`}
          onConfirm={(reason) => run("activate", reason)}
          trigger={
            <Button size="sm" variant="outline" className="h-8">
              Activate
            </Button>
          }
        />
      )}
      {status === "ACTIVE" && (
        <ConfirmDialog
          confirmLabel="Suspend"
          title="Suspend owner"
          description={`${label} will lose portal access until reactivated.`}
          impact={["Owner and staff logins are blocked", "Subscriptions keep running"]}
          onConfirm={(reason) => run("suspend", reason)}
          trigger={
            <Button size="sm" variant="outline" className="h-8">
              Suspend
            </Button>
          }
        />
      )}
      {status === "BLOCKED" ? (
        <ConfirmDialog
          destructive={false}
          confirmLabel="Unblock"
          title="Unblock owner"
          description={`${label} will be restored to active.`}
          onConfirm={(reason) => run("unblock", reason)}
          trigger={
            <Button size="sm" variant="outline" className="h-8">
              Unblock
            </Button>
          }
        />
      ) : (
        <ConfirmDialog
          confirmLabel="Block"
          title="Block owner"
          description={`${label} will be blocked from the platform.`}
          impact={["All logins denied", "Integrations stop syncing"]}
          onConfirm={(reason) => run("block", reason)}
          trigger={
            <Button size="sm" variant="outline" className="h-8">
              Block
            </Button>
          }
        />
      )}
    </div>
  );
}

function EntitlementsPanel({ ownerId }: { ownerId: string }) {
  const entitlements = useOwnerEntitlements(ownerId);
  const catalog = useFeatureCatalog();
  const addOverride = useAddEntitlementOverride(ownerId);
  const removeOverride = useRemoveEntitlementOverride(ownerId);

  const effective = new Set(entitlements.data?.effective ?? []);
  const overrideByKey = new Map(
    (entitlements.data?.overrides ?? []).map((o) => [o.featureKey, o] as const),
  );
  const features = catalog.data ?? [];

  const toggle = async (featureKey: string, granted: boolean) => {
    const existing = overrideByKey.get(featureKey);
    try {
      if (existing && existing.granted === granted) {
        await removeOverride.mutateAsync(existing.id);
        toast.success("Override removed", { description: "Feature follows the plan again." });
        return;
      }
      await addOverride.mutateAsync({ featureKey, granted });
      toast.success(granted ? "Feature granted" : "Feature revoked", { description: featureKey });
    } catch (error) {
      toast.error("Could not update entitlement", { description: errorMessage(error) });
    }
  };

  return (
    <Section
      title="Feature entitlements"
      description="Plan features plus owner-specific overrides."
    >
      <div className="px-4 py-2">
        <AsyncSection
          loading={entitlements.isLoading || catalog.isLoading}
          error={entitlements.error ?? catalog.error}
          onRetry={() => {
            void entitlements.refetch();
            void catalog.refetch();
          }}
          isEmpty={features.length === 0}
          emptyTitle="No feature catalogue"
          emptyDescription="Define features on a plan before granting overrides."
        >
          <ul className="divide-y divide-border">
            {features.map((f) => {
              const on = effective.has(f.key);
              const override = overrideByKey.get(f.key);
              return (
                <li key={f.key} className="flex items-center justify-between gap-4 py-2.5">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium">{f.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      {f.key}
                      {override ? ` · override: ${override.granted ? "granted" : "revoked"}` : ""}
                    </p>
                  </div>
                  <Switch
                    checked={on}
                    aria-label={`Toggle ${f.name}`}
                    disabled={addOverride.isPending || removeOverride.isPending}
                    onCheckedChange={(next) => void toggle(f.key, next)}
                  />
                </li>
              );
            })}
          </ul>
        </AsyncSection>
      </div>
    </Section>
  );
}

function OwnerDetailPage() {
  const { ownerId } = Route.useParams();
  const overview = useOwnerOverview(ownerId);
  const properties = useOwnerProperties(ownerId);
  const subscriptions = useSubscriptions({ ownerId, limit: 10 });
  const tickets = useTickets({ ownerId, limit: 5 });

  const owner = overview.data?.owner;
  const label = owner?.company ?? owner?.name ?? "Owner";
  const activeSubscription = subscriptions.data?.items?.[0];

  if (overview.isError) {
    return (
      <>
        <PageHeader
          eyebrow="Customers"
          title="Owner"
          breadcrumbs={[{ label: "Owners", to: "/owners" }]}
        />
        <div className="p-5 lg:p-6">
          <div className="panel">
            <ErrorState
              title="Owner could not be loaded"
              description={errorMessage(overview.error)}
              onRetry={() => overview.refetch()}
            />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        eyebrow="Customers"
        title={overview.isLoading ? "Loading owner…" : label}
        description={owner?.email}
        breadcrumbs={[{ label: "Owners", to: "/owners" }, { label }]}
        actions={
          owner ? (
            <div className="flex flex-wrap items-center gap-2">
              <StatusActions ownerId={ownerId} status={owner.status} label={label} />
              {activeSubscription && <ExtendSubscriptionDialog subscription={activeSubscription} />}
            </div>
          ) : undefined
        }
      />

      <div className="space-y-4 p-5 lg:p-6">
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {overview.isLoading
            ? Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-[86px] w-full rounded-lg" />
              ))
            : [
                { label: "Properties", value: num(overview.data?.propertiesCount) },
                { label: "MRR contribution", value: compactInr(overview.data?.mrrContribution) },
                { label: "Open tickets", value: num(overview.data?.openTickets) },
                {
                  label: "Last activity",
                  value: relativeTime(overview.data?.lastActivity),
                },
              ].map((kpi) => <KpiCard key={kpi.label} label={kpi.label} value={kpi.value} />)}
        </div>

        <div className="grid gap-4 xl:grid-cols-[1.4fr_1fr]">
          <Section title="Account details">
            <AsyncSection
              loading={overview.isLoading}
              error={overview.error}
              onRetry={() => overview.refetch()}
            >
              <DetailGrid
                items={[
                  { label: "Status", value: owner ? <StatusBadge status={owner.status} /> : "—" },
                  { label: "Contact", value: owner?.name ?? "—" },
                  { label: "Email", value: owner?.email ?? "—" },
                  { label: "Phone", value: owner?.phone ?? "—" },
                  { label: "Company", value: owner?.company ?? "—" },
                  { label: "GST number", value: owner?.gstNumber ?? "—" },
                  { label: "City", value: owner?.city ?? "—" },
                  { label: "Country", value: owner?.country ?? "—" },
                  { label: "Created", value: formatDate(owner?.createdAt) },
                ]}
              />
            </AsyncSection>
          </Section>

          <Section title="Subscription">
            <div className="px-4 py-2">
              <AsyncSection
                loading={subscriptions.isLoading}
                error={subscriptions.error}
                onRetry={() => subscriptions.refetch()}
                isEmpty={!activeSubscription}
                emptyTitle="No subscription"
                emptyDescription="This owner has no subscription on record yet."
              >
                {activeSubscription && (
                  <dl>
                    <MetricRow label="Plan" value={activeSubscription.plan} />
                    <MetricRow
                      label="Status"
                      value={<StatusBadge status={activeSubscription.status} />}
                    />
                    <MetricRow label="Billing cycle" value={humanise(activeSubscription.cycle)} />
                    <MetricRow
                      label="Current period ends"
                      value={formatDate(activeSubscription.currentPeriodEnd)}
                    />
                    <MetricRow
                      label="Property limit"
                      value={num(activeSubscription.propertyLimit)}
                    />
                    <MetricRow
                      label="Auto renew"
                      value={activeSubscription.autoRenew ? "Yes" : "No"}
                    />
                  </dl>
                )}
              </AsyncSection>
            </div>
          </Section>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          <Section
            title="Properties"
            description="Hotels owned by this account"
            actions={
              <Button asChild variant="outline" size="sm" className="h-7">
                <Link to="/properties">All properties</Link>
              </Button>
            }
          >
            <div className="px-4 py-2">
              <AsyncSection
                loading={properties.isLoading}
                error={properties.error}
                onRetry={() => properties.refetch()}
                isEmpty={(properties.data?.length ?? 0) === 0}
                emptyTitle="No properties"
                emptyDescription="This owner has not onboarded a hotel yet."
              >
                <ul className="divide-y divide-border">
                  {properties.data?.map((p) => (
                    <li key={p.id} className="flex items-center justify-between gap-3 py-2.5">
                      <Link
                        to="/properties/$propertyId"
                        params={{ propertyId: p.id }}
                        className="flex min-w-0 items-center gap-2 hover:underline"
                      >
                        <Building2 aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                        <span className="min-w-0">
                          <span className="block truncate text-sm font-medium">{p.name}</span>
                          <span className="block truncate text-xs text-muted-foreground">
                            {[p.city, p.country].filter(Boolean).join(", ") || "—"} ·{" "}
                            {num(p.roomCount)} rooms
                          </span>
                        </span>
                      </Link>
                      <StatusBadge status={p.status} />
                    </li>
                  ))}
                </ul>
              </AsyncSection>
            </div>
          </Section>

          <Section
            title="Recent tickets"
            actions={
              <Button asChild variant="outline" size="sm" className="h-7">
                <Link to="/support">Support inbox</Link>
              </Button>
            }
          >
            <div className="px-4 py-2">
              <AsyncSection
                loading={tickets.isLoading}
                error={tickets.error}
                onRetry={() => tickets.refetch()}
                isEmpty={(tickets.data?.items?.length ?? 0) === 0}
                emptyTitle="No tickets"
                emptyDescription="This owner has not raised any support tickets."
              >
                <ul className="divide-y divide-border">
                  {tickets.data?.items?.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-2.5">
                      <Link
                        to="/support/$ticketId"
                        params={{ ticketId: t.id }}
                        className="min-w-0 hover:underline"
                      >
                        <span className="block truncate text-sm font-medium">{t.subject}</span>
                        <span className="block truncate text-xs text-muted-foreground">
                          {humanise(t.priority)} · {relativeTime(t.createdAt)}
                        </span>
                      </Link>
                      <StatusBadge status={t.status} />
                    </li>
                  ))}
                </ul>
              </AsyncSection>
            </div>
          </Section>
        </div>

        <EntitlementsPanel ownerId={ownerId} />

        <Section title="Support tooling">
          <div className="flex flex-wrap items-center gap-2 p-4">
            <Button asChild variant="outline" size="sm" className="h-8">
              <Link to="/impersonation">
                <UserSearch aria-hidden className="mr-1.5 size-3.5" /> Start impersonation
              </Link>
            </Button>
            <Button asChild variant="outline" size="sm" className="h-8">
              <Link to="/audit">View audit trail</Link>
            </Button>
          </div>
        </Section>
      </div>
    </>
  );
}
