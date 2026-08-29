import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { toast } from "sonner";

import { useState } from "react";

import { ConfirmDialog } from "@/components/admin/confirm-dialog";
import { DataTable, type Column } from "@/components/admin/data-table";
import { ExportButton } from "@/components/admin/export-button";
import {
  ClearFiltersButton,
  EMPTY_LOCATION,
  LocationFilter,
  type LocationFilterValue,
  SearchBox,
  StatusFilter,
  ToolbarActions,
} from "@/components/admin/list-toolbar";
import { PageHeader, StatusBadge } from "@/components/admin/primitives";
import { OwnerEditDialog } from "@/components/admin/owner-edit-dialog";
import { Button } from "@/components/ui/button";
import {
  useDeleteOwner,
  useOwners,
  useSetOwnerStatus,
  type OwnerStatusAction,
} from "@/hooks/api/use-owners";
import type { Owner } from "@/hooks/api/types";
import { useListParams } from "@/hooks/use-list-params";
import { errorMessage } from "@/lib/api";
import { formatDate, relativeTime } from "@/lib/format";

export const Route = createFileRoute("/owners/")({
  head: () => ({
    meta: [
      { title: "Owners · Tavelo Super Admin" },
      { name: "description", content: "Every hotel owner account on the Tavelo platform." },
    ],
  }),
  component: OwnersPage,
});

const OWNER_STATUSES = ["ACTIVE", "PENDING", "SUSPENDED", "BLOCKED"];

function OwnerRowActions({ owner }: { owner: Owner }) {
  const setStatus = useSetOwnerStatus(owner.id);
  const deleteOwner = useDeleteOwner();

  const remove = async (reason: string) => {
    try {
      const result = await deleteOwner.mutateAsync({ id: owner.id, reason });
      toast.success("Owner deleted", {
        description: `${owner.company ?? owner.name} removed — ${result.subscriptionsCancelled} subscription(s) cancelled, ${result.propertiesArchived} property(ies) archived.`,
      });
    } catch (error) {
      toast.error("Could not delete owner", { description: errorMessage(error) });
    }
  };

  const run = async (action: OwnerStatusAction, reason: string) => {
    try {
      await setStatus.mutateAsync({ action, reason });
      toast.success(`Owner ${action}d`, { description: `${owner.company ?? owner.name} updated.` });
    } catch (error) {
      toast.error(`Could not ${action} owner`, { description: errorMessage(error) });
    }
  };

  const label = owner.company ?? owner.name;

  return (
    <div className="flex items-center justify-end gap-1">
      <OwnerEditDialog
        owner={owner}
        trigger={
          <Button variant="ghost" size="sm" className="h-7 text-xs">
            Edit
          </Button>
        }
      />
      {owner.status !== "ACTIVE" && (
        <ConfirmDialog
          destructive={false}
          confirmLabel="Activate"
          title="Activate owner"
          description={`${label} will regain full access to their portal.`}
          onConfirm={(reason) => run("activate", reason)}
          trigger={
            <Button variant="ghost" size="sm" className="h-7 text-xs">
              Activate
            </Button>
          }
        />
      )}
      {owner.status === "ACTIVE" && (
        <ConfirmDialog
          confirmLabel="Suspend"
          title="Suspend owner"
          description={`${label} will lose portal access until reactivated.`}
          impact={["Owner and staff logins are blocked", "Subscriptions keep running"]}
          onConfirm={(reason) => run("suspend", reason)}
          trigger={
            <Button variant="ghost" size="sm" className="h-7 text-xs">
              Suspend
            </Button>
          }
        />
      )}
      {owner.status === "BLOCKED" ? (
        <ConfirmDialog
          destructive={false}
          confirmLabel="Unblock"
          title="Unblock owner"
          description={`${label} will be restored to active.`}
          onConfirm={(reason) => run("unblock", reason)}
          trigger={
            <Button variant="ghost" size="sm" className="h-7 text-xs">
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
            <Button variant="ghost" size="sm" className="h-7 text-xs">
              Block
            </Button>
          }
        />
      )}
      <ConfirmDialog
        confirmLabel="Delete owner"
        title="Delete owner"
        description={`${label} will be removed from the Tavelo platform.`}
        impact={[
          "The owner and their staff lose all access",
          "Their subscription is cancelled immediately",
          "All of their properties are archived",
          "Billing and audit history is kept for the record",
        ]}
        onConfirm={(reason) => remove(reason)}
        trigger={
          <Button variant="ghost" size="sm" className="h-7 text-xs text-destructive">
            Delete
          </Button>
        }
      />
    </div>
  );
}

function OwnersPage() {
  const navigate = useNavigate();
  const list = useListParams();
  const [location, setLocation] = useState<LocationFilterValue>(EMPTY_LOCATION);
  const query = useOwners({
    limit: list.limit,
    offset: list.offset,
    q: list.q,
    status: list.statusParam,
    // Owners store their location as ids — send the ids.
    stateId: location.stateId || undefined,
    districtId: location.districtId || undefined,
  });

  const changeLocation = (next: LocationFilterValue) => {
    setLocation(next);
    list.setOffset(0);
  };

  const filtersActive =
    !!list.search || !!list.status || !!location.stateId || !!location.districtId;
  const clearFilters = () => {
    list.setSearch("");
    list.setStatus("");
    changeLocation(EMPTY_LOCATION);
  };

  const columns: Column<Owner>[] = [
    {
      key: "company",
      header: "Owner",
      cell: (o) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{o.company ?? o.name}</p>
          <p className="truncate text-xs text-muted-foreground">{o.email}</p>
        </div>
      ),
    },
    { key: "contact", header: "Contact", cell: (o) => o.name },
    {
      key: "location",
      header: "Location",
      cell: (o) => [o.city, o.country].filter(Boolean).join(", ") || "—",
    },
    { key: "status", header: "Status", cell: (o) => <StatusBadge status={o.status} /> },
    { key: "created", header: "Created", cell: (o) => formatDate(o.createdAt) },
    {
      key: "active",
      header: "Last active",
      cell: (o) => relativeTime(o.lastActiveAt ?? o.updatedAt),
    },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Customers"
        title="Owners"
        description="Every hotel owner account, their status and lifecycle."
        actions={
          <Button asChild size="sm" className="h-8">
            <Link to="/owners/new">
              <Plus aria-hidden className="mr-1.5 size-3.5" /> New owner
            </Link>
          </Button>
        }
      />
      <div className="p-5 lg:p-6">
        <DataTable
          rows={query.data?.items ?? []}
          columns={columns}
          rowKey={(o) => o.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          onRowClick={(o) => navigate({ to: "/owners/$ownerId", params: { ownerId: o.id } })}
          rowActions={(o) => <OwnerRowActions owner={o} />}
          emptyTitle="No owners match this view"
          emptyDescription="Adjust the search or status filter, or create the first owner."
          emptyAction={
            <Button asChild size="sm">
              <Link to="/owners/new">Create owner</Link>
            </Button>
          }
          pagination={{
            total: query.data?.total ?? 0,
            limit: list.limit,
            offset: list.offset,
            onOffsetChange: list.setOffset,
          }}
          toolbar={
            <>
              <SearchBox
                value={list.search}
                onChange={list.setSearch}
                placeholder="Search by name, email or company…"
              />
              <StatusFilter
                value={list.status}
                onChange={list.setStatus}
                options={OWNER_STATUSES}
              />
              <LocationFilter value={location} onChange={changeLocation} />
              <ClearFiltersButton show={filtersActive} onClear={clearFilters} />
              <ToolbarActions>
                <span className="tnum text-xs text-muted-foreground">
                  {query.data?.total ?? 0} total
                </span>
                <ExportButton
                  entity="owners"
                  filters={{
                    q: list.q,
                    status: list.statusParam,
                    stateId: location.stateId,
                    districtId: location.districtId,
                  }}
                />
              </ToolbarActions>
            </>
          }
        />
      </div>
    </>
  );
}
