import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { EmptyState, ErrorState, TableSkeleton } from "@/components/admin/primitives";

export type Column<T> = {
  key: string;
  header: string;
  cell: (row: T) => ReactNode;
  className?: string | undefined;
  align?: "right" | undefined;
};

type Props<T> = {
  rows: T[];
  columns: Column<T>[];
  rowKey: (row: T) => string;
  /** Toolbar contents (search box, filters, actions). */
  toolbar?: ReactNode | undefined;
  onRowClick?: ((row: T) => void) | undefined;
  rowActions?: ((row: T) => ReactNode) | undefined;
  loading?: boolean | undefined;
  error?: unknown | undefined;
  onRetry?: (() => void) | undefined;
  emptyTitle?: string | undefined;
  emptyDescription?: string | undefined;
  emptyAction?: ReactNode | undefined;
  /** Server-driven pagination. Omit to hide the pager. */
  pagination?: {
    total: number;
    limit: number;
    offset: number;
    onOffsetChange: (offset: number) => void;
  };
};

/**
 * Table shell for list screens. Rows always come from the API — this component
 * renders whatever it is given and never filters or paginates locally.
 */
export function DataTable<T>({
  rows,
  columns,
  rowKey,
  toolbar,
  onRowClick,
  rowActions,
  loading,
  error,
  onRetry,
  emptyTitle = "Nothing here yet",
  emptyDescription = "Once records exist they will appear in this table.",
  emptyAction,
  pagination,
}: Props<T>) {
  const showPager = !!pagination && !loading && !error && rows.length > 0;
  const from = pagination ? pagination.offset + 1 : 0;
  const to = pagination ? pagination.offset + rows.length : 0;
  const canPrev = !!pagination && pagination.offset > 0;
  const canNext = !!pagination && pagination.offset + pagination.limit < pagination.total;

  return (
    <div className="panel overflow-hidden">
      {toolbar && (
        <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
          {toolbar}
        </div>
      )}

      {error ? (
        <ErrorState onRetry={onRetry} description={describeError(error)} />
      ) : loading ? (
        <TableSkeleton rows={6} cols={columns.length} />
      ) : rows.length === 0 ? (
        <EmptyState title={emptyTitle} description={emptyDescription} action={emptyAction} />
      ) : (
        <div className="scrollbar-thin max-h-[70vh] overflow-auto">
          <table className="w-full min-w-[720px] border-collapse text-sm">
            <thead className="sticky top-0 z-10 bg-surface-muted">
              <tr className="border-b border-border">
                {columns.map((c) => (
                  <th
                    key={c.key}
                    scope="col"
                    className={cn(
                      "whitespace-nowrap px-3 py-2 text-left text-[11px] font-bold uppercase tracking-wider text-muted-foreground",
                      c.align === "right" && "text-right",
                    )}
                  >
                    {c.header}
                  </th>
                ))}
                {rowActions && <th scope="col" className="w-10 px-3 py-2" />}
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  onClick={onRowClick ? () => onRowClick(row) : undefined}
                  className={cn(
                    "border-b border-border last:border-0",
                    onRowClick && "cursor-pointer hover:bg-surface-muted",
                  )}
                >
                  {columns.map((c) => (
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
              ))}
            </tbody>
          </table>
        </div>
      )}

      {showPager && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border px-3 py-2 text-xs text-muted-foreground">
          <span className="tnum">
            {from}–{to} of {pagination.total}
          </span>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              aria-label="Previous page"
              disabled={!canPrev}
              onClick={() =>
                pagination.onOffsetChange(Math.max(0, pagination.offset - pagination.limit))
              }
            >
              <ChevronLeft aria-hidden className="size-3.5" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="size-7"
              aria-label="Next page"
              disabled={!canNext}
              onClick={() => pagination.onOffsetChange(pagination.offset + pagination.limit)}
            >
              <ChevronRight aria-hidden className="size-3.5" />
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function describeError(error: unknown): string {
  if (error instanceof Error && error.message) return error.message;
  return "The request to the platform API failed. This is usually temporary.";
}
