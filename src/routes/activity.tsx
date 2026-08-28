import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";

import { AsyncSection, PageHeader } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { useAuditLogs } from "@/hooks/api/use-operations";
import { formatDateTime, humanise, shortId } from "@/lib/format";

export const Route = createFileRoute("/activity")({
  head: () => ({
    meta: [
      { title: "Activity · Tavelo Super Admin" },
      { name: "description", content: "Recent platform activity across owners and properties." },
    ],
  }),
  component: ActivityPage,
});

const LIMIT = 30;

function ActivityPage() {
  const [offset, setOffset] = useState(0);
  const query = useAuditLogs({ limit: LIMIT, offset });
  const items = query.data?.items ?? [];
  const total = query.data?.total ?? 0;

  return (
    <div className="space-y-5">
      <PageHeader
        title="Activity"
        description="A chronological view of platform events, sourced from the audit trail."
      />

      <AsyncSection
        loading={query.isLoading}
        error={query.error}
        onRetry={() => void query.refetch()}
        isEmpty={items.length === 0}
        emptyTitle="No activity yet"
        emptyDescription="Platform events appear here as owners and admins use Tavelo."
      >
        <ol className="panel divide-y divide-border">
          {items.map((item) => (
            <li key={item.id} className="flex gap-3 p-4">
              <span aria-hidden className="mt-1.5 size-2 shrink-0 rounded-full bg-primary/70" />
              <div className="min-w-0 flex-1">
                <p className="text-sm text-foreground">
                  <span className="font-medium">{item.actor ?? "System"}</span>{" "}
                  <span className="text-muted-foreground">{humanise(item.action)}</span>{" "}
                  <span className="font-medium">{humanise(item.entity)}</span>{" "}
                  <span className="text-muted-foreground">{shortId(item.entityId)}</span>
                </p>
                <p className="mt-0.5 text-xs text-muted-foreground">{formatDateTime(item.ts)}</p>
              </div>
            </li>
          ))}
        </ol>

        <div className="flex items-center justify-between pt-3">
          <span className="text-xs text-muted-foreground">
            Showing {offset + 1}–{offset + items.length} of {total}
          </span>
          <div className="flex gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={offset === 0}
              onClick={() => setOffset(Math.max(0, offset - LIMIT))}
            >
              Previous
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={offset + LIMIT >= total}
              onClick={() => setOffset(offset + LIMIT)}
            >
              Next
            </Button>
          </div>
        </div>
      </AsyncSection>
    </div>
  );
}
