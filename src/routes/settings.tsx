import { createFileRoute } from "@tanstack/react-router";
import { Archive, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { MfaSettings } from "@/components/admin/mfa-settings";
import { AsyncSection, PageHeader, Section, StatusBadge } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  slugify,
  useAmenities,
  useArchiveAmenity,
  useCreateAmenity,
  useRestoreAmenity,
  useUpdateAmenity,
} from "@/hooks/api/use-amenities";
import type { Amenity, AmenityScope } from "@/hooks/api/types";
import {
  useCreateLocationDistrict,
  useCreateLocationState,
  useDeleteLocationDistrict,
  useDeleteLocationState,
  useLocationDistricts,
  useLocationStates,
} from "@/hooks/api/use-locations";
import { errorMessage } from "@/lib/api";

export const Route = createFileRoute("/settings")({
  head: () => ({
    meta: [
      { title: "Settings · Tavelo Super Admin" },
      {
        name: "description",
        content:
          "Platform settings: the state and district reference data, and the room and property amenity catalogue.",
      },
    ],
  }),
  component: SettingsPage,
});

function SettingsPage() {
  return (
    <div className="space-y-5">
      <PageHeader
        title="Settings"
        description="Your account security, and the reference data the owner apps consume."
      />
      <MfaSettings />
      <LocationSettings />
      <AmenitySettings />
    </div>
  );
}

/**
 * States and districts power the address dropdowns in the owner mobile app,
 * so this list is the single source of truth for both surfaces.
 */
function LocationSettings() {
  const [selectedState, setSelectedState] = useState<string | null>(null);
  const [stateName, setStateName] = useState("");
  const [districtName, setDistrictName] = useState("");

  const statesQuery = useLocationStates();
  const districtsQuery = useLocationDistricts(selectedState);

  const createState = useCreateLocationState();
  const deleteState = useDeleteLocationState();
  const createDistrict = useCreateLocationDistrict(selectedState);
  const deleteDistrict = useDeleteLocationDistrict();

  const states = statesQuery.data ?? [];
  const districts = districtsQuery.data ?? [];

  const addState = () => {
    const name = stateName.trim();
    if (!name) return;
    createState.mutate(name, {
      onSuccess: () => {
        setStateName("");
        toast.success("State added");
      },
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  const addDistrict = () => {
    const name = districtName.trim();
    if (!name || !selectedState) return;
    createDistrict.mutate(name, {
      onSuccess: () => {
        setDistrictName("");
        toast.success("District added");
      },
      onError: (error) => toast.error(errorMessage(error)),
    });
  };

  return (
    <Section
      title="Locations"
      description="States and districts offered in the owner app when adding a property or manager."
    >
      <div className="grid gap-4 lg:grid-cols-2">
        {/* States */}
        <div className="panel p-4">
          <h3 className="text-sm font-medium text-foreground">States</h3>

          <div className="mt-3 flex gap-2">
            <Input
              value={stateName}
              onChange={(event) => setStateName(event.target.value)}
              onKeyDown={(event) => event.key === "Enter" && addState()}
              placeholder="Add a state"
              className="h-9"
            />
            <Button onClick={addState} disabled={createState.isPending || !stateName.trim()}>
              {createState.isPending ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Plus className="size-4" />
              )}
            </Button>
          </div>

          <AsyncSection
            loading={statesQuery.isLoading}
            error={statesQuery.error}
            onRetry={() => void statesQuery.refetch()}
            isEmpty={states.length === 0}
            emptyTitle="No states yet"
            emptyDescription="Add the states your hotels operate in."
          >
            <ul className="mt-3 divide-y divide-border">
              {states.map((state) => (
                <li key={state.id} className="flex items-center gap-2 py-2">
                  <button
                    type="button"
                    onClick={() => setSelectedState(state.id)}
                    className={`flex-1 truncate text-left text-sm ${
                      selectedState === state.id
                        ? "font-medium text-foreground"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {state.name}
                  </button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={deleteState.isPending}
                    onClick={() =>
                      deleteState.mutate(state.id, {
                        onSuccess: () => {
                          if (selectedState === state.id) setSelectedState(null);
                          toast.success("State removed");
                        },
                        onError: (error) => toast.error(errorMessage(error)),
                      })
                    }
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          </AsyncSection>
        </div>

        {/* Districts */}
        <div className="panel p-4">
          <h3 className="text-sm font-medium text-foreground">
            Districts
            {selectedState && (
              <span className="ml-2 text-xs font-normal text-muted-foreground">
                {states.find((state) => state.id === selectedState)?.name}
              </span>
            )}
          </h3>

          {!selectedState ? (
            <p className="mt-3 text-sm text-muted-foreground">
              Select a state to manage its districts.
            </p>
          ) : (
            <>
              <div className="mt-3 flex gap-2">
                <Input
                  value={districtName}
                  onChange={(event) => setDistrictName(event.target.value)}
                  onKeyDown={(event) => event.key === "Enter" && addDistrict()}
                  placeholder="Add a district"
                  className="h-9"
                />
                <Button
                  onClick={addDistrict}
                  disabled={createDistrict.isPending || !districtName.trim()}
                >
                  {createDistrict.isPending ? (
                    <Loader2 className="size-4 animate-spin" />
                  ) : (
                    <Plus className="size-4" />
                  )}
                </Button>
              </div>

              <AsyncSection
                loading={districtsQuery.isLoading}
                error={districtsQuery.error}
                onRetry={() => void districtsQuery.refetch()}
                isEmpty={districts.length === 0}
                emptyTitle="No districts yet"
                emptyDescription="Add the districts within this state."
              >
                <ul className="mt-3 divide-y divide-border">
                  {districts.map((district) => (
                    <li key={district.id} className="flex items-center gap-2 py-2">
                      <span className="flex-1 truncate text-sm text-muted-foreground">
                        {district.name}
                      </span>
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={deleteDistrict.isPending}
                        onClick={() =>
                          deleteDistrict.mutate(district.id, {
                            onSuccess: () => toast.success("District removed"),
                            onError: (error) => toast.error(errorMessage(error)),
                          })
                        }
                      >
                        <Trash2 className="size-3.5" />
                      </Button>
                    </li>
                  ))}
                </ul>
              </AsyncSection>
            </>
          )}
        </div>
      </div>
    </Section>
  );
}

/* ------------------------------------------------------------- amenities */

const SCOPES = [
  { value: "ROOM" as const, label: "Room" },
  { value: "PROPERTY" as const, label: "Property" },
];

/**
 * The platform-wide amenity catalogue.
 *
 * Every hotel picks from this one list, which is what makes "Wifi" the same
 * row everywhere and lets reporting group on `key` rather than on free text.
 * Deliberately NOT the `features` / plan-entitlement catalogue: those decide
 * what a subscription includes, these are physical things in a room or a hotel.
 *
 * Note there is no "Non-AC" entry and there never should be. Air conditioning
 * is a boolean on the room type — two sibling amenities would let a room type
 * carry both (meaningless) or neither (indistinguishable from an unfilled form).
 */
function AmenitySettings() {
  const [scope, setScope] = useState<AmenityScope>("ROOM");
  const [name, setName] = useState("");
  const [key, setKey] = useState("");
  const [icon, setIcon] = useState("");
  const [keyEdited, setKeyEdited] = useState(false);

  const query = useAmenities(scope);
  const create = useCreateAmenity();
  const update = useUpdateAmenity();
  const archive = useArchiveAmenity();
  const restore = useRestoreAmenity();

  const items = query.data?.items ?? [];
  const active = items.filter((a) => a.status === "ACTIVE");
  const archived = items.filter((a) => a.status !== "ACTIVE");

  const reset = () => {
    setName("");
    setKey("");
    setIcon("");
    setKeyEdited(false);
  };

  const add = () => {
    const trimmed = name.trim();
    const slug = (keyEdited ? key : slugify(trimmed)).trim();
    if (!trimmed || !slug) return;
    create.mutate(
      {
        name: trimmed,
        key: slug,
        scope,
        // Sort new entries to the end of their scope rather than interleaving
        // them into the seeded ordering.
        sortOrder: (items.at(-1)?.sortOrder ?? 0) + 10,
        ...(icon.trim() ? { icon: icon.trim() } : {}),
      },
      {
        onSuccess: () => {
          reset();
          toast.success("Amenity added");
        },
        onError: (error) => toast.error(errorMessage(error)),
      },
    );
  };

  const busy = create.isPending || update.isPending || archive.isPending || restore.isPending;

  return (
    <Section
      title="Amenities"
      description="The one catalogue every hotel picks from. Room amenities attach to room types and to individual rooms; property amenities are set by the owner on the hotel itself."
      actions={
        <div className="flex gap-1">
          {SCOPES.map((s) => (
            <Button
              key={s.value}
              size="sm"
              variant={scope === s.value ? "default" : "outline"}
              onClick={() => setScope(s.value)}
            >
              {s.label}
            </Button>
          ))}
        </div>
      }
    >
      <div className="panel p-4">
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
          <Input
            value={name}
            onChange={(event) => {
              setName(event.target.value);
              if (!keyEdited) setKey(slugify(event.target.value));
            }}
            onKeyDown={(event) => event.key === "Enter" && add()}
            placeholder={scope === "ROOM" ? "Sea view" : "Swimming pool"}
            className="h-9"
          />
          <Input
            value={key}
            onChange={(event) => {
              setKeyEdited(true);
              setKey(event.target.value);
            }}
            onKeyDown={(event) => event.key === "Enter" && add()}
            placeholder="key (slug)"
            className="h-9 font-mono text-xs"
          />
          <Input
            value={icon}
            onChange={(event) => setIcon(event.target.value)}
            onKeyDown={(event) => event.key === "Enter" && add()}
            placeholder="icon name (optional)"
            className="h-9"
          />
          <Button onClick={add} disabled={create.isPending || !name.trim()}>
            {create.isPending ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Plus className="size-4" />
            )}
          </Button>
        </div>
        <p className="mt-2 text-xs text-muted-foreground">
          The key is the stable identity clients match on and cannot be changed once saved. The icon
          is a name (e.g. <code className="font-mono">wifi</code>), resolved by each app to its own
          icon set.
        </p>

        <AsyncSection
          loading={query.isLoading}
          error={query.error}
          onRetry={() => void query.refetch()}
          isEmpty={items.length === 0}
          emptyTitle="No amenities yet"
          emptyDescription="Add the first one and every hotel will be able to pick it."
        >
          <ul className="mt-4 divide-y divide-border">
            {active.map((amenity) => (
              <AmenityRow
                key={amenity.id}
                amenity={amenity}
                busy={busy}
                onRename={(next) =>
                  update.mutate(
                    { id: amenity.id, patch: { name: next } },
                    {
                      onSuccess: () => toast.success("Amenity renamed"),
                      onError: (error) => toast.error(errorMessage(error)),
                    },
                  )
                }
                action={
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={busy}
                    title="Archive — hides it from the pickers, keeps it on rooms that already have it"
                    onClick={() =>
                      archive.mutate(amenity.id, {
                        onSuccess: () => toast.success(`${amenity.name} archived`),
                        onError: (error) => toast.error(errorMessage(error)),
                      })
                    }
                  >
                    <Archive className="size-3.5" />
                  </Button>
                }
              />
            ))}
          </ul>

          {archived.length > 0 && (
            <>
              <p className="mt-6 text-xs font-medium text-muted-foreground">
                Archived · {archived.length}
              </p>
              <p className="mt-1 text-xs text-muted-foreground">
                No longer offered when a hotel edits a room type, but still shown on every room that
                already had it. Nothing was removed.
              </p>
              <ul className="mt-2 divide-y divide-border opacity-70">
                {archived.map((amenity) => (
                  <AmenityRow
                    key={amenity.id}
                    amenity={amenity}
                    busy={busy}
                    action={
                      <Button
                        size="sm"
                        variant="ghost"
                        disabled={busy}
                        title="Restore to the pickers"
                        onClick={() =>
                          restore.mutate(amenity.id, {
                            onSuccess: () => toast.success(`${amenity.name} restored`),
                            onError: (error) => toast.error(errorMessage(error)),
                          })
                        }
                      >
                        <RotateCcw className="size-3.5" />
                      </Button>
                    }
                  />
                ))}
              </ul>
            </>
          )}
        </AsyncSection>
      </div>
    </Section>
  );
}

/** One catalogue row. The name is editable in place; the key never is. */
function AmenityRow({
  amenity,
  busy,
  action,
  onRename,
}: {
  amenity: Amenity;
  busy: boolean;
  action: React.ReactNode;
  onRename?: ((next: string) => void) | undefined;
}) {
  const [draft, setDraft] = useState(amenity.name);
  const dirty = draft.trim() !== amenity.name && draft.trim().length > 0;

  return (
    <li className="flex items-center gap-2 py-2">
      {onRename ? (
        <Input
          value={draft}
          disabled={busy}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => event.key === "Enter" && dirty && onRename(draft.trim())}
          onBlur={() => dirty && onRename(draft.trim())}
          className="h-8 max-w-56 border-transparent bg-transparent px-1 text-sm shadow-none focus-visible:border-border focus-visible:bg-surface"
        />
      ) : (
        <span className="max-w-56 flex-1 truncate px-1 text-sm">{amenity.name}</span>
      )}
      <code className="truncate font-mono text-xs text-muted-foreground">{amenity.key}</code>
      {amenity.icon && (
        <span className="hidden truncate text-xs text-muted-foreground sm:inline">
          {amenity.icon}
        </span>
      )}
      <span className="flex-1" />
      <StatusBadge status={amenity.status} />
      {action}
    </li>
  );
}
