import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Loader2, Plus } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

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
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Property } from "@/hooks/api/types";
import { useCreateProperty, useProperties } from "@/hooks/api/use-properties";
import { useOwners } from "@/hooks/api/use-owners";
import { useListParams } from "@/hooks/use-list-params";
import { errorMessage } from "@/lib/api";
import { formatDate, num } from "@/lib/format";

function CreatePropertyDialog() {
  const [open, setOpen] = useState(false);
  const [ownerId, setOwnerId] = useState("");
  const [name, setName] = useState("");
  const [city, setCity] = useState("");
  const [stateName, setStateName] = useState("");
  const [roomCount, setRoomCount] = useState("");

  const owners = useOwners({ limit: 200, offset: 0 });
  const create = useCreateProperty();

  const invalid = !ownerId || name.trim().length < 2;

  const reset = () => {
    setOwnerId("");
    setName("");
    setCity("");
    setStateName("");
    setRoomCount("");
  };

  const submit = async () => {
    try {
      const property = await create.mutateAsync({
        ownerId,
        name: name.trim(),
        city: city.trim() || undefined,
        state: stateName.trim() || undefined,
        roomCount: roomCount ? Number(roomCount) : undefined,
      });
      toast.success("Property created", { description: property.name });
      setOpen(false);
      reset();
    } catch (error) {
      toast.error("Could not create property", { description: errorMessage(error) });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button size="sm" className="h-8">
          <Plus aria-hidden className="mr-1.5 size-3.5" /> New property
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>New property</DialogTitle>
          <DialogDescription>
            Onboard a hotel under an owner account. Rooms and rates are configured afterwards.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="prop-owner">Owner</Label>
            <Select value={ownerId} onValueChange={setOwnerId}>
              <SelectTrigger id="prop-owner">
                <SelectValue placeholder={owners.isLoading ? "Loading…" : "Select an owner"} />
              </SelectTrigger>
              <SelectContent>
                {(owners.data?.items ?? []).map((owner) => (
                  <SelectItem key={owner.id} value={owner.id}>
                    {owner.company ?? owner.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prop-name">Property name</Label>
            <Input id="prop-name" value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="prop-city">City</Label>
              <Input id="prop-city" value={city} onChange={(e) => setCity(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="prop-state">State</Label>
              <Input id="prop-state" value={stateName} onChange={(e) => setStateName(e.target.value)} />
            </div>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="prop-rooms">Room count (optional)</Label>
            <Input id="prop-rooms" type="number" min={0} value={roomCount} onChange={(e) => setRoomCount(e.target.value)} />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setOpen(false)} disabled={create.isPending}>
            Cancel
          </Button>
          <Button disabled={invalid || create.isPending} onClick={() => void submit()}>
            {create.isPending && <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />}
            Create property
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export const Route = createFileRoute("/properties/")({
  head: () => ({
    meta: [
      { title: "Properties · Tavelo Super Admin" },
      { name: "description", content: "Every hotel managed on the Tavelo platform." },
    ],
  }),
  component: PropertiesPage,
});

const PROPERTY_STATUSES = ["ACTIVE", "DRAFT", "PENDING", "SUSPENDED", "ARCHIVED"];

function PropertiesPage() {
  const navigate = useNavigate();
  const list = useListParams();
  const [location, setLocation] = useState<LocationFilterValue>(EMPTY_LOCATION);
  const query = useProperties({
    limit: list.limit,
    offset: list.offset,
    q: list.q,
    status: list.statusParam,
    // Properties store their location as text names — send the resolved names.
    state: location.stateName || undefined,
    district: location.districtName || undefined,
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

  const columns: Column<Property>[] = [
    {
      key: "name",
      header: "Property",
      cell: (p) => (
        <div className="min-w-0">
          <p className="truncate font-medium text-foreground">{p.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            {[p.city, p.state, p.country].filter(Boolean).join(", ") || "—"}
          </p>
        </div>
      ),
    },
    {
      key: "owner",
      header: "Owner",
      cell: (p) =>
        p.owner ? (
          <Link
            to="/owners/$ownerId"
            params={{ ownerId: p.ownerId }}
            className="text-primary hover:underline"
            onClick={(e) => e.stopPropagation()}
          >
            {p.owner}
          </Link>
        ) : (
          "—"
        ),
    },
    { key: "category", header: "Category", cell: (p) => p.category ?? "—" },
    {
      key: "stars",
      header: "Rating",
      cell: (p) => (p.starRating ? `${p.starRating}★` : "—"),
    },
    { key: "rooms", header: "Rooms", align: "right", cell: (p) => num(p.roomCount) },
    { key: "status", header: "Status", cell: (p) => <StatusBadge status={p.status} /> },
    { key: "created", header: "Onboarded", cell: (p) => formatDate(p.createdAt) },
  ];

  return (
    <>
      <PageHeader
        eyebrow="Customers"
        title="Properties"
        description="Hotels onboarded across every owner account."
        actions={<CreatePropertyDialog />}
      />
      <div className="p-5 lg:p-6">
        <DataTable
          rows={query.data?.items ?? []}
          columns={columns}
          rowKey={(p) => p.id}
          loading={query.isLoading}
          error={query.error}
          onRetry={() => query.refetch()}
          onRowClick={(p) =>
            navigate({ to: "/properties/$propertyId", params: { propertyId: p.id } })
          }
          emptyTitle="No properties match this view"
          emptyDescription="Adjust the search or status filter to widen the results."
          emptyAction={
            <Button asChild size="sm" variant="outline">
              <Link to="/owners">Browse owners</Link>
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
                placeholder="Search by hotel name or city…"
              />
              <StatusFilter
                value={list.status}
                onChange={list.setStatus}
                options={PROPERTY_STATUSES}
              />
              <LocationFilter value={location} onChange={changeLocation} />
              <ClearFiltersButton show={filtersActive} onClear={clearFilters} />
              <ToolbarActions>
                <span className="tnum text-xs text-muted-foreground">
                  {query.data?.total ?? 0} total
                </span>
                <ExportButton
                  entity="properties"
                  filters={{
                    q: list.q,
                    status: list.statusParam,
                    state: location.stateName,
                    district: location.districtName,
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
