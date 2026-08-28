import { Link } from "@tanstack/react-router";
import { cva, type VariantProps } from "class-variance-authority";
import {
  AlertTriangle, ChevronRight, Inbox, RefreshCw, ShieldAlert, ArrowUpRight, ArrowDownRight,
} from "lucide-react";
import type { ReactNode } from "react";

import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { statusTone, type StatusTone } from "@/lib/travelo-data";

/* ---------------------------------------------------------------- status */

const statusBadge = cva(
  "inline-flex items-center gap-1.5 rounded-md border px-2 py-0.5 text-[11px] font-semibold leading-5 whitespace-nowrap",
  {
    variants: {
      tone: {
        success: "border-success/25 bg-success-soft text-success",
        warning: "border-warning/30 bg-warning-soft text-warning",
        danger: "border-destructive/25 bg-destructive-soft text-destructive",
        info: "border-info/25 bg-info-soft text-info",
        neutral: "border-border bg-surface-muted text-muted-foreground",
      },
      dot: { true: "", false: "" },
    },
    defaultVariants: { tone: "neutral", dot: true },
  },
);

export function StatusBadge({
  status,
  tone,
  className,
}: { status: string; tone?: StatusTone } & { className?: string }) {
  const resolved = tone ?? statusTone[status] ?? "neutral";
  return (
    <span className={cn(statusBadge({ tone: resolved }), className)}>
      <span
        aria-hidden
        className={cn(
          "size-1.5 rounded-full",
          resolved === "success" && "bg-success",
          resolved === "warning" && "bg-warning",
          resolved === "danger" && "bg-destructive",
          resolved === "info" && "bg-info",
          resolved === "neutral" && "bg-muted-foreground",
        )}
      />
      {status}
    </span>
  );
}

export type { VariantProps };

/* ------------------------------------------------------------ page header */

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  breadcrumbs,
}: {
  eyebrow?: string;
  title: string;
  description?: string;
  actions?: ReactNode;
  breadcrumbs?: { label: string; to?: string }[];
}) {
  return (
    <header className="border-b border-border bg-surface px-5 py-4 lg:px-8 lg:py-5">
      {breadcrumbs && breadcrumbs.length > 0 && (
        <nav aria-label="Breadcrumb" className="mb-2 flex items-center gap-1 text-xs text-muted-foreground">
          {breadcrumbs.map((b, i) => (
            <span key={b.label} className="flex items-center gap-1">
              {i > 0 && <ChevronRight aria-hidden className="size-3" />}
              {b.to ? (
                <Link to={b.to} className="hover:text-foreground hover:underline">
                  {b.label}
                </Link>
              ) : (
                <span className="text-foreground">{b.label}</span>
              )}
            </span>
          ))}
        </nav>
      )}
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          {eyebrow && <p className="eyebrow mb-1">{eyebrow}</p>}
          <h1 className="truncate text-xl font-bold text-foreground lg:text-[1.4rem]">{title}</h1>
          {description && (
            <p className="mt-1 max-w-2xl text-sm text-muted-foreground">{description}</p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
      </div>
    </header>
  );
}

export function Section({
  title,
  description,
  actions,
  children,
  className,
}: {
  title?: string;
  description?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={cn("panel overflow-hidden", className)}>
      {(title || actions) && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-4 py-3">
          <div>
            {title && <h2 className="text-sm font-bold text-foreground">{title}</h2>}
            {description && <p className="text-xs text-muted-foreground">{description}</p>}
          </div>
          {actions && <div className="flex items-center gap-2">{actions}</div>}
        </div>
      )}
      {children}
    </section>
  );
}

/* -------------------------------------------------------------------- kpi */

export function KpiCard({
  label,
  value,
  delta,
  trend,
  hint,
}: {
  label: string;
  value: string;
  delta?: string;
  trend?: string;
  hint?: string;
}) {
  const Icon = trend === "down" ? ArrowDownRight : ArrowUpRight;
  return (
    <div className="panel p-3.5">
      <p className="eyebrow truncate">{label}</p>
      <p className="tnum mt-1.5 text-2xl font-bold tracking-tight text-foreground">{value}</p>
      <div className="mt-1 flex items-center gap-1.5 text-xs">
        {delta && (
          <span
            className={cn(
              "tnum inline-flex items-center gap-0.5 font-semibold",
              trend === "down" ? "text-warning" : "text-success",
            )}
          >
            <Icon aria-hidden className="size-3" />
            {delta}
          </span>
        )}
        {hint && <span className="truncate text-muted-foreground">{hint}</span>}
      </div>
    </div>
  );
}

export function MetricRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-border py-2 last:border-0">
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className="tnum text-sm font-semibold text-foreground">{value}</dd>
    </div>
  );
}

/* ------------------------------------------------------------- ownership */

export function OwnershipTrail({ nodes }: { nodes: { label: string; to?: string }[] }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border border-border bg-surface-muted px-2.5 py-1.5 text-xs">
      {nodes.map((n, i) => (
        <span key={n.label} className="flex items-center gap-1.5">
          {i > 0 && <ChevronRight aria-hidden className="size-3 text-muted-foreground" />}
          {n.to ? (
            <Link to={n.to} className="font-semibold text-primary hover:underline">
              {n.label}
            </Link>
          ) : (
            <span className="font-semibold text-foreground">{n.label}</span>
          )}
        </span>
      ))}
    </div>
  );
}

/* ----------------------------------------------------------------- states */

export function EmptyState({
  title,
  description,
  action,
  icon: Icon = Inbox,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: typeof Inbox;
}) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-14 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-border bg-surface-muted">
        <Icon aria-hidden className="size-5 text-muted-foreground" />
      </div>
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">{description}</p>
      {action && <div className="mt-4">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = "We couldn't load this data",
  description = "The request to the platform API failed. This is usually temporary.",
  onRetry,
}: {
  title?: string;
  description?: string;
  onRetry?: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex flex-col items-center justify-center px-6 py-12 text-center"
    >
      <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-destructive/25 bg-destructive-soft">
        <AlertTriangle aria-hidden className="size-5 text-destructive" />
      </div>
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
      <Button variant="outline" size="sm" className="mt-4" onClick={onRetry}>
        <RefreshCw aria-hidden className="mr-1.5 size-3.5" />
        Retry
      </Button>
    </div>
  );
}

export function PermissionDenied({ scope }: { scope: string }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-12 text-center">
      <div className="mb-3 flex size-10 items-center justify-center rounded-lg border border-warning/30 bg-warning-soft">
        <ShieldAlert aria-hidden className="size-5 text-warning" />
      </div>
      <h3 className="text-sm font-bold text-foreground">Permission denied</h3>
      <p className="mt-1 max-w-md text-sm text-muted-foreground">
        Your admin role does not include <span className="font-semibold text-foreground">{scope}</span>.
        Request access from a Super Admin in Roles &amp; Permissions.
      </p>
    </div>
  );
}

export function TableSkeleton({ rows = 6, cols = 6 }: { rows?: number; cols?: number }) {
  return (
    <div className="divide-y divide-border">
      {Array.from({ length: rows }).map((_, r) => (
        <div key={r} className="flex items-center gap-4 px-4 py-3">
          {Array.from({ length: cols }).map((_, c) => (
            <Skeleton key={c} className={cn("h-3.5 flex-1", c === 0 && "max-w-[180px] flex-[2]")} />
          ))}
        </div>
      ))}
    </div>
  );
}

export function ChartSkeleton({ height = 240 }: { height?: number }) {
  return <Skeleton className="w-full" style={{ height }} />;
}

/* --------------------------------------------------------------- timeline */

export function Timeline({
  items,
}: {
  items: { time: string; text: string; actor?: string; owner?: string; tone?: string }[];
}) {
  return (
    <ol className="relative ml-1 border-l border-border">
      {items.map((item, i) => (
        <li key={i} className="relative py-3 pl-5">
          <span
            aria-hidden
            className={cn(
              "absolute -left-[5px] top-4 size-2.5 rounded-full ring-4 ring-surface",
              item.tone === "danger" && "bg-destructive",
              item.tone === "warning" && "bg-warning",
              item.tone === "success" && "bg-success",
              item.tone === "info" && "bg-info",
              (!item.tone || item.tone === "neutral") && "bg-border-strong",
            )}
          />
          <p className="text-sm text-foreground">{item.text}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">
            {item.actor && <span className="font-medium text-foreground">{item.actor}</span>}
            {item.owner && <> · {item.owner}</>} · {item.time}
          </p>
        </li>
      ))}
    </ol>
  );
}

/* ------------------------------------------------------------- progress */

export function ScoreBar({ value, label }: { value: number; label?: string }) {
  const tone = value >= 85 ? "bg-success" : value >= 60 ? "bg-warning" : "bg-destructive";
  return (
    <div className="min-w-[120px]">
      <div className="mb-1 flex items-center justify-between text-xs">
        <span className="text-muted-foreground">{label}</span>
        <span className="tnum font-semibold text-foreground">{value}%</span>
      </div>
      <div className="h-1.5 w-full overflow-hidden rounded-full bg-surface-muted">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}
