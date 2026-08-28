import {
  ArrowDown, ArrowUp, ChevronLeft, ChevronRight, Columns3, Download, Search, SlidersHorizontal,
} from "lucide-react";
import { useMemo, useState, type ReactNode } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu, DropdownMenuCheckboxItem, DropdownMenuContent, DropdownMenuLabel,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import { EmptyState, TableSkeleton } from "@/components/admin/primitives";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  sortValue?: (row: T) => string | number;
  className?: string;
  align?: "right";
  optional?: boolean;
};

type Props<T> = {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  searchKeys?: (row: T) => string;
  searchPlaceholder?: string;
  filters?: ReactNode;
  toolbarExtra?: ReactNode;
  onRowClick?: (row: T) => void;
  rowActions?: (row: T) => ReactNode;
  selectable?: boolean;
  bulkActions?: (selected: string[], clear: () => void) => ReactNode;
  pageSize?: number;
  loading?: boolean;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: ReactNode;
  exportName?: string;
};

export function DataTable<T>({
  rows,
  columns,
  rowKey,
  searchKeys,
  searchPlaceholder = "Search…",
  filters,
  toolbarExtra,
  onRowClick,
  rowActions,
  selectable,
  bulkActions,
  pageSize = 8,
  loading,
  emptyTitle = "Nothing here yet",
  emptyDescription = "Once records exist they will appear in this table.",
  emptyAction,
  exportName = "export",
}: Props<T>) {
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: "asc" | "desc" } | null>(null);
  const [page, setPage] = useState(1);
  const [hidden, setHidden] = useState<string[]>([]);
  const [selected, setSelected] = useState<string[]>([]);

  const visibleColumns = columns.filter((c) => !hidden.includes(c.key));

  const filtered = useMemo(() => {
    let out = rows;
    if (query && searchKeys) {
      const q = query.toLowerCase();
      out = out.filter((r) => searchKeys(r).toLowerCase().includes(q));
    }
    if (sort) {
      const col = columns.find((c) => c.key === sort.key);
      if (col?.sortValue) {
        out = [...out].sort((a, b) => {
          const av = col.sortValue!(a);
          const bv = col.sortValue!(b);
          const cmp = typeof av === "number" && typeof bv === "number"
            ? av - bv
            : String(av).localeCompare(String(bv));
          return sort.dir === "asc" ? cmp : -cmp;
        });
      }
    }
    return out;
  }, [rows, query, sort, columns, searchKeys]);

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const current = Math.min(page, pages);
  const pageRows = filtered.slice((current - 1) * pageSize, current * pageSize);

  const toggleSort = (key: string) =>
    setSort((s) =>
      s?.key === key ? (s.dir === "asc" ? { key, dir: "desc" } : null) : { key, dir: "asc" },
    );

  return (
    <div className="panel overflow-hidden">
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
        {searchKeys && (
          <div className="relative min-w-[200px] flex-1">
            <Search aria-hidden className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
              placeholder={searchPlaceholder}
              aria-label={searchPlaceholder}
              className="h-8 pl-8 text-sm"
            />
          </div>
        )}
        {filters}
        {toolbarExtra}
        <div className="ml-auto flex items-center gap-1.5">
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => toast.success("Saved filter applied", { description: "Showing your default view." })}
          >
            <SlidersHorizontal aria-hidden className="mr-1.5 size-3.5" />
            Saved views
          </Button>
          {columns.some((c) => c.optional) && (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="h-8">
                  <Columns3 aria-hidden className="mr-1.5 size-3.5" />
                  Columns
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-48">
                <DropdownMenuLabel>Visible columns</DropdownMenuLabel>
                <DropdownMenuSeparator />
                {columns.filter((c) => c.optional).map((c) => (
                  <DropdownMenuCheckboxItem
                    key={c.key}
                    checked={!hidden.includes(c.key)}
                    onCheckedChange={(v) =>
                      setHidden((h) => (v ? h.filter((k) => k !== c.key) : [...h, c.key]))
                    }
                  >
                    {c.header}
                  </DropdownMenuCheckboxItem>
                ))}
              </DropdownMenuContent>
            </DropdownMenu>
          )}
          <Button
            variant="outline"
            size="sm"
            className="h-8"
            onClick={() => toast.success(`${exportName} export queued`, { description: "You'll get an email when the CSV is ready." })}
          >
            <Download aria-hidden className="mr-1.5 size-3.5" />
            Export
          </Button>
        </div>
      </div>

      {selectable && selected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border bg-primary-soft px-3 py-2 text-xs">
          <span className="font-semibold text-accent-foreground">{selected.length} selected</span>
          {bulkActions?.(selected, () => setSelected([]))}
          <Button variant="ghost" size="sm" className="h-7" onClick={() => setSelected([])}>
            Clear
          </Button>
        </div>
      )}

      {loading ? (
        <TableSkeleton rows={pageSize} cols={visibleColumns.length} />
      ) : pageRows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      ) : (
        <div className="scrollbar-thin max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-surface-muted">
              <tr className="border-b border-border">
                {selectable && (
                  <th scope="col" className="w-9 px-3 py-2">
                    <Checkbox
                      aria-label="Select all rows on this page"
                      checked={pageRows.every((r) => selected.includes(rowKey(r)))}
                      onCheckedChange={(v) =>
                        setSelected(v ? pageRows.map(rowKey) : [])
                      }
                    />
                  </th>
                )}
                {visibleColumns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={cn(
                      "whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground",
                      c.align === "right" && "text-right",
                    )}
                  >
                    {c.sortValue ? (
                      <button
                        type="button"
                        onClick={() => toggleSort(c.key)}
                        className="inline-flex items-center gap-1 rounded hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                      >
                        {c.header}
                        {sort?.key === c.key ? (
                          sort.dir === "asc" ? (
                            <ArrowUp aria-hidden className="size-3" />
                          ) : (
                            <ArrowDown aria-hidden className="size-3" />
                          )
                        ) : null}
                      </button>
                    ) : (
                      c.header
                    )}
                  </th>
                ))}
                {rowActions && <th scope="col" className="w-10 px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => {
                const key = rowKey(row);
                return (
                  <tr
                    key={key}
                    onClick={onRowClick ? () => onRowClick(row) : undefined}
                    className={cn(
                      "border-b border-border last:border-0",
                      onRowClick && "cursor-pointer hover:bg-surface-muted",
                    )}
                  >
                    {selectable && (
                      <td className="px-3 py-2.5" onClick={(e) => e.stopPropagation()}>
                        <Checkbox
                          aria-label={`Select ${key}`}
                          checked={selected.includes(key)}
                          onCheckedChange={(v) =>
                            setSelected((s) => (v ? [...s, key] : s.filter((k) => k !== key)))
                          }
                        />
                      </td>
                    )}
                    {visibleColumns.map((c) => (
                      <td
                        key={c.key}
                        className={cn(
                          "px-3 py-2.5 align-middle",
                          c.align === "right" && "text-right",
                          c.className,
                        )}
                      >
                        {c.cell(row)}
                      </td>
                    ))}
                    {rowActions && (
                      <td className="px-3 py-2.5 text-right" onClick={(e) => e.stopPropagation()}>
                        {rowActions(row)}
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {!loading && filtered.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <span className="tnum">
            {(current - 1) * pageSize + 1}–{Math.min(current * pageSize, filtered.length)} of{" "}
            {filtered.length}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              aria-label="Previous page"
              disabled={current === 1}
              onClick={() => setPage(current - 1)}
            >
              <ChevronLeft aria-hidden className="size-3.5" />
            </Button>
            <span className="tnum px-1.5 font-medium text-foreground">
              {current} / {pages}
            </span>
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              aria-label="Next page"
              disabled={current === pages}
              onClick={() => setPage(current + 1)}
            >
              <ChevronRight aria-hidden className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
