import { Download, Loader2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { errorMessage, type QueryParams } from "@/lib/api";
import { downloadCsv, type ExportEntity } from "@/lib/export";

/**
 * Toolbar action that downloads the current list as CSV.
 *
 * `filters` is whatever the screen is currently sending to its list endpoint,
 * so the file matches the rows on screen rather than the whole table. Empty
 * values are dropped by `buildQuery`, so passing the raw filter state is safe.
 */
export function ExportButton({
  entity,
  filters,
  label = "Export",
}: {
  entity: ExportEntity;
  filters?: QueryParams | undefined;
  label?: string | undefined;
}) {
  const [busy, setBusy] = useState(false);

  const run = async () => {
    setBusy(true);
    try {
      const filename = await downloadCsv(entity, filters);
      toast.success("Export ready", { description: `Downloaded ${filename}.` });
    } catch (error) {
      toast.error("Could not export", { description: errorMessage(error) });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Button
      variant="outline"
      size="sm"
      className="h-8 text-xs"
      disabled={busy}
      onClick={() => void run()}
    >
      {busy ? (
        <Loader2 aria-hidden className="mr-1.5 size-3.5 animate-spin" />
      ) : (
        <Download aria-hidden className="mr-1.5 size-3.5" />
      )}
      {label}
    </Button>
  );
}
