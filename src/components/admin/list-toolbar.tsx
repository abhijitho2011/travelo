import { Search, X } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useLocationDistricts, useLocationStates } from "@/hooks/api/use-locations";
import { ALL_VALUE, fromSelect, toSelect } from "@/hooks/use-list-params";
import { humanise } from "@/lib/format";

export function SearchBox({
  value,
  onChange,
  placeholder = "Search…",
}: {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string | undefined;
}) {
  return (
    <div className="relative min-w-[200px] flex-1">
      <Search
        aria-hidden
        className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        aria-label={placeholder}
        className="h-8 pl-8 text-sm"
      />
    </div>
  );
}

export function StatusFilter({
  value,
  onChange,
  options,
  label = "Status",
  allLabel = "All statuses",
  className = "h-8 w-[170px] text-sm",
}: {
  value: string;
  onChange: (value: string) => void;
  options: string[];
  label?: string | undefined;
  allLabel?: string | undefined;
  className?: string | undefined;
}) {
  return (
    <Select value={toSelect(value)} onValueChange={(v) => onChange(fromSelect(v))}>
      <SelectTrigger className={className} aria-label={label}>
        <SelectValue placeholder={allLabel} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL_VALUE}>{allLabel}</SelectItem>
        {options.map((option) => (
          <SelectItem key={option} value={option}>
            {humanise(option)}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function ToolbarActions({ children }: { children: ReactNode }) {
  return <div className="ml-auto flex items-center gap-1.5">{children}</div>;
}

/**
 * State + (dependent) District dropdowns for list toolbars. Emits both the id
 * and the resolved name so owners (filter by id) and properties/staff (filter by
 * text name) can each take what they need. Changing the state resets the
 * district. Pass `showDistrict={false}` for a state-only filter (e.g. staff).
 */
export type LocationFilterValue = {
  stateId: string;
  stateName: string;
  districtId: string;
  districtName: string;
};

export const EMPTY_LOCATION: LocationFilterValue = {
  stateId: "",
  stateName: "",
  districtId: "",
  districtName: "",
};

export function LocationFilter({
  value,
  onChange,
  showDistrict = true,
  className = "h-8 w-[160px] text-sm",
}: {
  value: LocationFilterValue;
  onChange: (value: LocationFilterValue) => void;
  showDistrict?: boolean | undefined;
  className?: string | undefined;
}) {
  const states = useLocationStates();
  const districts = useLocationDistricts(value.stateId || null);

  const pickState = (raw: string) => {
    const id = fromSelect(raw);
    if (!id) return onChange(EMPTY_LOCATION);
    const name = states.data?.find((s) => s.id === id)?.name ?? "";
    // Changing the state always clears whatever district was chosen under it.
    onChange({ stateId: id, stateName: name, districtId: "", districtName: "" });
  };

  const pickDistrict = (raw: string) => {
    const id = fromSelect(raw);
    if (!id) return onChange({ ...value, districtId: "", districtName: "" });
    const name = districts.data?.find((d) => d.id === id)?.name ?? "";
    onChange({ ...value, districtId: id, districtName: name });
  };

  return (
    <>
      <Select value={toSelect(value.stateId)} onValueChange={pickState}>
        <SelectTrigger className={className} aria-label="State">
          <SelectValue placeholder={states.isLoading ? "Loading…" : "All states"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL_VALUE}>All states</SelectItem>
          {(states.data ?? []).map((s) => (
            <SelectItem key={s.id} value={s.id}>
              {s.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {showDistrict && (
        <Select
          value={toSelect(value.districtId)}
          onValueChange={pickDistrict}
          disabled={!value.stateId}
        >
          <SelectTrigger className={className} aria-label="District">
            <SelectValue
              placeholder={
                !value.stateId
                  ? "All districts"
                  : districts.isLoading
                    ? "Loading…"
                    : "All districts"
              }
            />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={ALL_VALUE}>All districts</SelectItem>
            {(districts.data ?? []).map((d) => (
              <SelectItem key={d.id} value={d.id}>
                {d.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </>
  );
}

/** Small "clear all filters" affordance, shown only when a filter is active. */
export function ClearFiltersButton({ show, onClear }: { show: boolean; onClear: () => void }) {
  if (!show) return null;
  return (
    <Button
      variant="ghost"
      size="sm"
      className="h-8 text-xs text-muted-foreground"
      onClick={onClear}
    >
      <X aria-hidden className="mr-1 size-3.5" />
      Clear filters
    </Button>
  );
}
