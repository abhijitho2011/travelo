import { Check, Copy, ExternalLink, Loader2, ShieldAlert, UserSearch } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useStartImpersonation } from "@/hooks/api/use-operations";
import { errorMessage } from "@/lib/api";

const MIN_REASON = 10;

/** Where the owner portal is served, if this deployment knows. */
function ownerPortalUrl(): string | null {
  const raw = import.meta.env["VITE_OWNER_PORTAL_URL"] as string | undefined;
  const trimmed = raw?.trim();
  return trimmed ? trimmed.replace(/\/+$/, "") : null;
}

type Issued = { token: string; sessionId: string; expiresInSeconds: number };

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      size="sm"
      variant="outline"
      className="h-8 shrink-0"
      onClick={() => {
        void navigator.clipboard
          .writeText(value)
          .then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          })
          .catch(() => toast.error("Could not copy to the clipboard"));
      }}
    >
      {copied ? (
        <Check aria-hidden className="mr-1.5 size-3.5" />
      ) : (
        <Copy aria-hidden className="mr-1.5 size-3.5" />
      )}
      {copied ? "Copied" : label}
    </Button>
  );
}

/**
 * Starts an audited support session against one owner account.
 *
 * The token is SHOWN, never injected. Writing it into the owner portal's
 * storage would mean this origin reaching across into another one, and would
 * hide from the agent that they are handling a credential. Copy, paste, and be
 * deliberate about it.
 */
export function ImpersonateDialog({
  ownerId,
  ownerLabel,
  disabled,
}: {
  ownerId: string;
  ownerLabel: string;
  disabled?: boolean | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [issued, setIssued] = useState<Issued | null>(null);
  const start = useStartImpersonation();

  const tooShort = reason.trim().length < MIN_REASON;
  const portal = ownerPortalUrl();

  const reset = () => {
    setReason("");
    setIssued(null);
  };

  const run = async () => {
    try {
      const result = await start.mutateAsync({
        targetUserType: "OWNER",
        targetOwnerId: ownerId,
        targetUserId: ownerId,
        reason: reason.trim(),
      });
      setIssued({
        token: result.token,
        sessionId: result.session.id,
        expiresInSeconds: result.expiresInSeconds,
      });
    } catch (error) {
      toast.error("Could not start the session", { description: errorMessage(error) });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) reset();
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8" disabled={disabled}>
          <UserSearch aria-hidden className="mr-1.5 size-3.5" /> Impersonate
        </Button>
      </DialogTrigger>

      <DialogContent className="sm:max-w-lg">
        {issued ? (
          <>
            <DialogHeader>
              <DialogTitle>Support session started</DialogTitle>
              <DialogDescription>
                Read-only access to {ownerLabel}&apos;s portal for{" "}
                {Math.round(issued.expiresInSeconds / 60)} minutes. Everything you look at is
                recorded against your own admin account.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 text-sm">
              <div className="rounded-md border border-border bg-muted/40 p-3">
                <p className="mb-2 font-medium">How to use it</p>
                <ol className="list-decimal space-y-1 pl-4 text-muted-foreground">
                  <li>Copy the token below.</li>
                  <li>Open the owner portal and sign in with this token as the bearer.</li>
                  <li>
                    You can read; you cannot change anything. Writes are refused with
                    <code className="mx-1 rounded bg-background px-1 py-0.5 text-xs">
                      IMPERSONATION_READ_ONLY
                    </code>
                    by design.
                  </li>
                  <li>End the session from the Impersonation page when you are done.</li>
                </ol>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="impersonation-token">Session token</Label>
                <div className="flex items-start gap-2">
                  <textarea
                    id="impersonation-token"
                    readOnly
                    rows={4}
                    value={issued.token}
                    onFocus={(e) => e.currentTarget.select()}
                    className="min-w-0 flex-1 resize-none rounded-md border border-border bg-background p-2 font-mono text-[11px] leading-relaxed break-all"
                  />
                  <CopyButton value={issued.token} label="Copy" />
                </div>
                <p className="text-xs text-muted-foreground">
                  Treat it like a password: it authenticates as {ownerLabel} until it expires or the
                  session is terminated.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {portal ? (
                  <Button asChild variant="outline" size="sm" className="h-8">
                    <a href={portal} target="_blank" rel="noreferrer noopener">
                      <ExternalLink aria-hidden className="mr-1.5 size-3.5" /> Open owner portal
                    </a>
                  </Button>
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Owner portal URL not configured (VITE_OWNER_PORTAL_URL).
                  </p>
                )}
                <CopyButton value={issued.sessionId} label="Copy session id" />
              </div>
            </div>

            <DialogFooter>
              <Button
                onClick={() => {
                  setOpen(false);
                  reset();
                }}
              >
                Done
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Impersonate {ownerLabel}</DialogTitle>
              <DialogDescription>
                Starts a recorded, read-only support session against this owner&apos;s portal.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4">
              <div className="flex gap-2 rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm">
                <ShieldAlert aria-hidden className="mt-0.5 size-4 shrink-0 text-amber-600" />
                <div className="space-y-1">
                  <p className="font-medium">You will be able to read, not act.</p>
                  <p className="text-muted-foreground">
                    The owner sees a banner naming you for as long as the session lasts, and every
                    request is audited against your admin account.
                  </p>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="impersonation-reason">
                  Reason <span className="text-muted-foreground">(required)</span>
                </Label>
                <Textarea
                  id="impersonation-reason"
                  rows={3}
                  value={reason}
                  placeholder="e.g. Ticket #482 — owner reports their October invoice is missing"
                  onChange={(e) => setReason(e.target.value)}
                />
                <p className="text-xs text-muted-foreground">
                  {tooShort
                    ? `At least ${MIN_REASON} characters — this is what an auditor reads later.`
                    : "Stored on the session and in the audit trail."}
                </p>
              </div>
            </div>

            <DialogFooter>
              <Button variant="outline" onClick={() => setOpen(false)}>
                Cancel
              </Button>
              <Button disabled={tooShort || start.isPending} onClick={() => void run()}>
                {start.isPending ? (
                  <Loader2 aria-hidden className="mr-1.5 size-3.5 animate-spin" />
                ) : (
                  <UserSearch aria-hidden className="mr-1.5 size-3.5" />
                )}
                Start session
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
