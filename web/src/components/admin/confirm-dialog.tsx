import { type ReactNode, useState } from "react";
import { toast } from "sonner";

import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

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
  impact?: string[];
  confirmLabel?: string;
  destructive?: boolean;
  requireReason?: boolean;
  onConfirm?: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const blocked = requireReason && reason.trim().length < 4;

  return (
    <AlertDialog>
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
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction
            disabled={blocked}
            className={destructive ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : undefined}
            onClick={() => {
              onConfirm?.(reason);
              toast.success(`${confirmLabel} completed`, {
                description: "An audit entry was created automatically.",
              });
              setReason("");
            }}
          >
            {confirmLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
