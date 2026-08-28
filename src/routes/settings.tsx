import { createFileRoute } from "@tanstack/react-router";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { AsyncSection, PageHeader, Section } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
        content: "Platform settings, including the state and district reference data.",
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
        description="Platform configuration. Reference data here is consumed by the owner apps."
      />
      <LocationSettings />
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
