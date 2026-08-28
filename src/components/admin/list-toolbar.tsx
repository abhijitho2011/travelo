import { Search } from "lucide-react";
import type { ReactNode } from "react";

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
