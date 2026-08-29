/**
 * CSV downloads from `GET /api/v1/admin/export/:entity.csv`.
 *
 * A plain `<a href>` cannot do this. The export endpoint is authenticated with
 * a bearer token, and a browser navigation carries no Authorization header —
 * it would arrive as an anonymous request and 401. So the file is fetched with
 * the header attached, turned into a Blob, and handed to a synthetic anchor
 * pointing at an object URL.
 */

import { ApiError, apiBaseUrl, buildQuery, readAccessToken, type QueryParams } from "@/lib/api";

export const EXPORT_ENTITIES = [
  "owners",
  "properties",
  "staff",
  "subscriptions",
  "payments",
  "invoices",
  "audit-logs",
] as const;

export type ExportEntity = (typeof EXPORT_ENTITIES)[number];

/** Reads the filename the server chose, falling back to a dated default. */
export function filenameFrom(disposition: string | null, entity: ExportEntity): string {
  const match = disposition?.match(/filename="?([^";]+)"?/i);
  return match?.[1] ?? `${entity}-${new Date().toISOString().slice(0, 10)}.csv`;
}

/**
 * Fetches the CSV for `entity` under the CURRENT filters and saves it.
 *
 * Filters are the same query params the list screen already sends, so an
 * export is always "what I am looking at", never "everything".
 */
export async function downloadCsv(entity: ExportEntity, filters?: QueryParams): Promise<string> {
  const token = readAccessToken();
  if (!token) {
    throw new ApiError("Your session has expired. Please sign in again.", "UNAUTHORIZED", 401);
  }

  const url = `${apiBaseUrl()}/export/${entity}.csv${buildQuery(filters)}`;

  let res: Response;
  try {
    res = await fetch(url, {
      headers: { authorization: `Bearer ${token}`, accept: "text/csv" },
    });
  } catch {
    throw new ApiError(
      "Could not reach the platform API. Check your connection and try again.",
      "NETWORK_ERROR",
      0,
    );
  }

  if (!res.ok) {
    // A failed export answers with the normal JSON error envelope.
    const body = (await res.json().catch(() => null)) as {
      error?: { code?: string; message?: string };
    } | null;
    throw new ApiError(
      body?.error?.message ??
        (res.status === 403
          ? "You do not have permission to export this data."
          : "The export could not be generated."),
      body?.error?.code ?? `HTTP_${res.status}`,
      res.status,
    );
  }

  const filename = filenameFrom(res.headers.get("content-disposition"), entity);
  const blob = await res.blob();
  saveBlob(blob, filename);
  return filename;
}

/** Hands a Blob to the browser as a download, then releases the object URL. */
export function saveBlob(blob: Blob, filename: string): void {
  const objectUrl = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = objectUrl;
  anchor.download = filename;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  // Revoking immediately can cancel the download in some browsers; one tick
  // after the click is enough for the save to have been handed off.
  setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
}
