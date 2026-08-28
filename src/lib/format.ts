/**
 * Presentation helpers shared across admin screens.
 * Contains no data — only formatters and status→tone mapping.
 */

export type StatusTone = "success" | "warning" | "danger" | "neutral" | "info";

/**
 * Maps backend status values (SCREAMING_SNAKE) and human labels to a tone.
 * Lookup is case/format insensitive so `ACTIVE`, `Active` and `active` match.
 */
const TONE_BY_STATUS: Record<string, StatusTone> = {
  active: "success",
  healthy: "success",
  approved: "success",
  success: "success",
  successful: "success",
  paid: "success",
  published: "success",
  resolved: "success",
  connected: "success",
  completed: "success",
  online: "success",
  up: "success",
  enabled: "success",
  done: "success",

  trial: "info",
  inprogress: "info",
  processing: "info",
  open: "info",
  issued: "info",
  running: "info",
  scheduled: "info",
  new: "info",

  expiring: "warning",
  expiringsoon: "warning",
  pending: "warning",
  degraded: "warning",
  warning: "warning",
  graceperiod: "warning",
  waitingforowner: "warning",
  unpublished: "warning",
  retried: "warning",
  partiallyrefunded: "warning",
  suspended: "warning",

  expired: "danger",
  failed: "danger",
  critical: "danger",
  down: "danger",
  error: "danger",
  disconnected: "danger",
  overdue: "danger",
  blocked: "danger",
  terminated: "danger",
  high: "danger",

  draft: "neutral",
  inactive: "neutral",
  archived: "neutral",
  cancelled: "neutral",
  canceled: "neutral",
  closed: "neutral",
  refunded: "neutral",
  unassigned: "neutral",
  disabled: "neutral",
  normal: "neutral",
  low: "neutral",
};

function normaliseKey(status: string) {
  return status.toLowerCase().replace(/[\s_-]/g, "");
}

export function toneForStatus(status?: string | null): StatusTone {
  if (!status) return "neutral";
  return TONE_BY_STATUS[normaliseKey(status)] ?? "neutral";
}

/** `GRACE_PERIOD` → `Grace period`, `IN_PROGRESS` → `In progress`. */
export function humanise(value?: string | null): string {
  if (!value) return "—";
  if (!/[_A-Z]/.test(value.slice(1))) return value;
  const words = value.replace(/_/g, " ").toLowerCase().trim();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

const inrFormatter = new Intl.NumberFormat("en-IN", {
  style: "currency",
  currency: "INR",
  maximumFractionDigits: 0,
});

const numFormatter = new Intl.NumberFormat("en-IN");

/** Money values from the API are integer minor units (paise). */
export function inr(minorUnits?: number | null): string {
  if (minorUnits === null || minorUnits === undefined || Number.isNaN(minorUnits)) return "—";
  return inrFormatter.format(minorUnits / 100);
}

/** Formats an already-major-unit amount (analytics MRR/ARR are stored in paise too). */
export function compactInr(minorUnits?: number | null): string {
  if (minorUnits === null || minorUnits === undefined || Number.isNaN(minorUnits)) return "—";
  const rupees = minorUnits / 100;
  if (Math.abs(rupees) >= 1_00_00_000) return `₹${(rupees / 1_00_00_000).toFixed(2)}Cr`;
  if (Math.abs(rupees) >= 1_00_000) return `₹${(rupees / 1_00_000).toFixed(2)}L`;
  return inrFormatter.format(rupees);
}

export function num(value?: number | null): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return numFormatter.format(value);
}

export function percent(value?: number | null, digits = 1): string {
  if (value === null || value === undefined || Number.isNaN(value)) return "—";
  return `${value.toFixed(digits)}%`;
}

export function formatDate(value?: string | number | Date | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

export function formatDateTime(value?: string | number | Date | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleString("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function relativeTime(value?: string | number | Date | null): string {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  const diff = Date.now() - d.getTime();
  const mins = Math.round(diff / 60000);
  if (Math.abs(mins) < 1) return "just now";
  if (Math.abs(mins) < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (Math.abs(hours) < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 30) return `${days}d ago`;
  return formatDate(d);
}

export function daysUntil(value?: string | number | Date | null): number | null {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return Math.ceil((d.getTime() - Date.now()) / 86_400_000);
}

/** Truncates long identifiers for display, keeping them copyable via `title`. */
export function shortId(id?: string | null, length = 8): string {
  if (!id) return "—";
  return id.length <= length ? id : `${id.slice(0, length)}…`;
}
