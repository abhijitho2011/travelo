import { Loader2 } from "lucide-react";
import { type ReactNode, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

/**
 * Confirmation for destructive/audited actions. `onConfirm` performs the real
 * API call; the dialog stays open until it settles so failures surface inline.
 */
export function ConfirmDialog({
  trigger,
  title,
  description,
  impact,
  confirmLabel = "Confirm",
  destructive = true,
  requireReason = true,
  onConfirm,
}: {
  trigger: ReactNode;
  title: string;
  description: string;
  impact?: string[] | undefined;
  confirmLabel?: string | undefined;
  destructive?: boolean | undefined;
  requireReason?: boolean | undefined;
  onConfirm: (reason: string) => Promise<unknown> | unknown;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const blocked = (requireReason && reason.trim().length < 4) || busy;

  const run = async () => {
    setBusy(true);
    try {
      await onConfirm(reason.trim());
      setOpen(false);
      setReason("");
    } finally {
      setBusy(false);
    }
  };

  return (
    <AlertDialog open={open} onOpenChange={setOpen}>
      <AlertDialogTrigger asChild>{trigger}</AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>
        {impact && impact.length > 0 && (
          <div className="rounded-md border border-warning/30 bg-warning-soft px-3 py-2 text-xs text-foreground">
            <p className="mb-1 font-bold uppercase tracking-wide text-warning">What will happen</p>
            <ul className="list-disc space-y-0.5 pl-4">
              {impact.map((i) => (
                <li key={i}>{i}</li>
              ))}
            </ul>
          </div>
        )}
        {requireReason && (
          <div className="space-y-1.5">
            <Label htmlFor="confirm-reason">Reason (recorded in audit log)</Label>
            <Textarea
              id="confirm-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Explain why this action is being taken…"
              rows={3}
            />
          </div>
        )}
        <AlertDialogFooter>
          <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={blocked}
            className={
              destructive
                ? "bg-destructive text-destructive-foreground hover:bg-destructive/90"
                : undefined
            }
            onClick={(e) => {
              e.preventDefault();
              void run();
            }}
          >
            {busy && <Loader2 aria-hidden className="mr-2 size-4 animate-spin" />}
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
