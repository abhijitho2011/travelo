import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

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
import type { StaffMember } from "@/hooks/api/types";
import { useStaff } from "@/hooks/api/use-staff";
import { useListParams } from "@/hooks/use-list-params";
import { humanise } from "@/lib/format";

export const Route = createFileRoute("/staff")({
  head: () => ({
    meta: [
      { title: "Staff · Tavelo Super Admin" },
      { name: "description", content: "Hotel staff monitoring across owner organisations." },
    ],
  }),
  component: StaffPage,
});

const STAFF_ROLES = ["GENERAL_MANAGER", "ASSISTANT_GENERAL_MANAGER"];
const STAFF_STATUSES = ["ACTIVE", "BLOCKED"];

function StaffPage() {
  const list = useListParams();
  const [location, setLocation] = useState<LocationFilterValue>(EMPTY_LOCATION);
  const [role, setRole] = useState("");

  const query = useStaff({
    limit: list.limit,
    offset: list.offset,
    q: list.q,
    status: list.statusParam,
    role: role || undefined,
    // Staff store their state as a text name — send the resolved name.
    state: location.stateName || undefined,
  });

  const changeLocation = (next: LocationFilterValue) => {
    setLocation(next);
    list.setOffset(0);
  };
  const changeRole = (next: string) => {
    setRole(next);
    list.setOffset(0);
  };
  const filtersActive = !!list.search || !!list.status || !!role || !!location.stateId;
  const clearFilters = () => {
    list.setSearch("");
    list.setStatus("");
    changeRole("");
    changeLocation(EMPTY_LOCATION);
  };

  const columns: Column<StaffMember>[] = [
    {
      key: "name",
      header: "Staff",
      cell: (s) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{s.fullName || "—"}</p>
          <p className="truncate text-xs text-muted-foreground">{s.email}</p>
        </div>
      ),
    },
    { key: "role", header: "Role", cell: (s) => humanise(s.role) },
    {
      key: "owner",
      header: "Owner",
      cell: (s) => s.ownerName ?? "—",
    },
    {
      key: "property",
      header: "Property",
      cell: (s) => s.propertyName ?? "—",
    },
    {
      key: "location",
      header: "State / District",
      cell: (s) => [s.state, s.district].filter(Boolean).join(", ") || "—",
    },
    { key: "status", header: "Status", cell: (s) => <StatusBadge status={s.status} /> },
    { key: "contact", header: "Contact", cell: (s) => s.mobile || "—" },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Operations"
        title="Staff"
        description="General Managers and Assistant GMs created by owners, across every organisation."
      />
      <div className="p-5 lg:p-6">
        <DataTable
          rows={query.data?.items ?? []}
          columns={columns}
          rowKey={(s) => s.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          emptyTitle="No staff match this view"
          emptyDescription="Owners manage their General Managers and Assistant GMs in the owner app. Adjust the filters to widen the results."
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
                placeholder="Search by property or staff name…"
              />
              <StatusFilter
                value={role}
                onChange={changeRole}
                options={STAFF_ROLES}
                label="Role"
                allLabel="All roles"
              />
              <StatusFilter
                value={list.status}
                onChange={list.setStatus}
                options={STAFF_STATUSES}
              />
              <LocationFilter value={location} onChange={changeLocation} showDistrict={false} />
              <ClearFiltersButton show={filtersActive} onClear={clearFilters} />
              <ToolbarActions>
                <span className="tnum text-xs text-muted-foreground">
                  {query.data?.total ?? 0} total
                </span>
                <ExportButton
                  entity="staff"
                  filters={{ q: list.q, status: list.statusParam, role, state: location.stateName }}
                />
              </ToolbarActions>
            </>
          }
        />
      </div>
    </>
  );
}
