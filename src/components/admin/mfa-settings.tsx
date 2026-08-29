import { Check, Copy, KeyRound, Loader2, ShieldCheck, ShieldOff } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Section } from "@/components/admin/primitives";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useDisableMfa,
  useEnrollMfa,
  useMfaStatus,
  useVerifyMfa,
  type MfaEnrolment,
} from "@/hooks/api/use-mfa";
import { errorMessage } from "@/lib/api";

/**
 * Two-factor authentication for the signed-in admin.
 *
 * Opt-in: an admin who never enrols keeps signing in exactly as before. Once
 * enrolled, OTP and Google sign-in stop returning a session on their own — the
 * server issues one only after the challenge is answered.
 */
export function MfaSettings() {
  const status = useMfaStatus();
  const enroll = useEnrollMfa();
  const [draft, setDraft] = useState<MfaEnrolment | null>(null);

  const busy = status.isLoading;
  const enabled = status.data?.enabled === true;
  const available = status.data?.available !== false;

  const startEnrolment = async () => {
    try {
      setDraft(await enroll.mutateAsync());
    } catch (error) {
      toast.error("Could not start enrolment", { description: errorMessage(error) });
    }
  };

  return (
    <Section
      title="Two-factor authentication"
      description="A time-based code from an authenticator app, on top of Google or mobile OTP sign-in."
    >
      <div className="space-y-4 p-4">
        {busy ? (
          <p className="text-sm text-muted-foreground">Checking…</p>
        ) : !available ? (
          <p className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
            Two-factor authentication is unavailable on this deployment: no encryption key is
            configured, and the platform will not store an authenticator secret in the clear.
            Contact your platform operator.
          </p>
        ) : enabled ? (
          <EnabledPanel unusedRecoveryCodes={status.data?.unusedRecoveryCodes ?? 0} />
        ) : draft ? (
          <EnrolmentPanel draft={draft} onCancel={() => setDraft(null)} />
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm font-medium">Not enabled</p>
              <p className="text-sm text-muted-foreground">
                Sign-in currently needs only one factor. Enrolling adds a code from your
                authenticator app, plus ten single-use recovery codes.
              </p>
            </div>
            <Button size="sm" disabled={enroll.isPending} onClick={() => void startEnrolment()}>
              {enroll.isPending ? (
                <Loader2 aria-hidden className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <ShieldCheck aria-hidden className="mr-1.5 size-3.5" />
              )}
              Set up
            </Button>
          </div>
        )}
      </div>
    </Section>
  );
}

function CopyButton({ value, label = "Copy" }: { value: string; label?: string }) {
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
 * Scan, save the recovery codes, then prove a code works. MFA is switched on
 * only at that last step — an admin who scanned and then lost the phone would
 * otherwise be locked out of the only portal there is.
 */
function EnrolmentPanel({ draft, onCancel }: { draft: MfaEnrolment; onCancel: () => void }) {
  const verify = useVerifyMfa();
  const [code, setCode] = useState("");
  const [saved, setSaved] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await verify.mutateAsync(code.trim());
      toast.success("Two-factor authentication is on", {
        description: "Your next sign-in will ask for a code.",
      });
      onCancel();
    } catch (error) {
      toast.error("Could not verify that code", { description: errorMessage(error) });
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
        <img
          src={draft.qrDataUri}
          alt="QR code for your authenticator app"
          className="size-40 rounded-md border border-border bg-white p-1"
        />
        <div className="min-w-0 space-y-2 text-sm">
          <p className="font-medium">1. Scan this with your authenticator app</p>
          <p className="text-muted-foreground">
            Google Authenticator, 1Password, Authy — anything that does TOTP.
          </p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 truncate rounded bg-muted px-2 py-1 font-mono text-xs">
              {draft.secret}
            </code>
            <CopyButton value={draft.secret} label="Copy key" />
          </div>
          <p className="text-xs text-muted-foreground">
            Can&apos;t scan? Enter that key by hand instead.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        <p className="text-sm font-medium">2. Save your recovery codes</p>
        <p className="text-sm text-muted-foreground">
          Shown once, and once only — the platform keeps hashes, not the codes. Each one signs you
          in exactly once if you lose your authenticator.
        </p>
        <ul className="grid grid-cols-2 gap-1.5 rounded-md border border-border bg-muted/40 p-3 font-mono text-sm sm:grid-cols-3">
          {draft.recoveryCodes.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
        <div className="flex flex-wrap items-center gap-3">
          <CopyButton value={draft.recoveryCodes.join("\n")} label="Copy all codes" />
          <label className="flex items-center gap-2 text-sm">
            <Checkbox
              checked={saved}
              onCheckedChange={(v) => setSaved(v === true)}
              aria-label="I have saved my recovery codes"
            />
            I have saved these somewhere safe
          </label>
        </div>
      </div>

      <form onSubmit={submit} className="space-y-2">
        <Label htmlFor="mfa-enrol-code">3. Enter a code from the app to finish</Label>
        <div className="flex flex-wrap items-center gap-2">
          <Input
            id="mfa-enrol-code"
            inputMode="numeric"
            autoComplete="one-time-code"
            maxLength={6}
            placeholder="123456"
            className="tnum w-40 text-center tracking-[0.3em]"
            value={code}
            onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
          />
          <Button
            type="submit"
            size="sm"
            disabled={!saved || code.length !== 6 || verify.isPending}
          >
            {verify.isPending ? (
              <Loader2 aria-hidden className="mr-1.5 size-3.5 animate-spin" />
            ) : (
              <ShieldCheck aria-hidden className="mr-1.5 size-3.5" />
            )}
            Turn on
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        </div>
        {!saved && (
          <p className="text-xs text-muted-foreground">
            Confirm you have saved the recovery codes first.
          </p>
        )}
      </form>
    </div>
  );
}

function EnabledPanel({ unusedRecoveryCodes }: { unusedRecoveryCodes: number }) {
  const disable = useDisableMfa();
  const [code, setCode] = useState("");
  const [confirming, setConfirming] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await disable.mutateAsync(code.trim());
      toast.success("Two-factor authentication is off");
      setConfirming(false);
      setCode("");
    } catch (error) {
      toast.error("Could not turn it off", { description: errorMessage(error) });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-sm font-medium">
            <ShieldCheck aria-hidden className="size-4 text-emerald-600" /> Enabled
          </p>
          <p className="text-sm text-muted-foreground">
            {unusedRecoveryCodes} recovery code{unusedRecoveryCodes === 1 ? "" : "s"} left.
            {unusedRecoveryCodes <= 2 &&
              " Turn two-factor off and on again to mint a fresh set before you run out."}
          </p>
        </div>
        {!confirming && (
          <Button size="sm" variant="outline" onClick={() => setConfirming(true)}>
            <ShieldOff aria-hidden className="mr-1.5 size-3.5" /> Turn off
          </Button>
        )}
      </div>

      {confirming && (
        <form onSubmit={submit} className="space-y-2 rounded-md border border-border p-3">
          <Label htmlFor="mfa-disable-code">
            Enter a current code to turn it off
            <span className="ml-1 font-normal text-muted-foreground">
              (a recovery code works too)
            </span>
          </Label>
          <p className="text-xs text-muted-foreground">
            A signed-in session is not enough on its own — otherwise a stolen session could strip
            the second factor.
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <Input
              id="mfa-disable-code"
              autoComplete="one-time-code"
              maxLength={32}
              placeholder="123456"
              className="tnum w-48 text-center tracking-[0.2em]"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
            <Button
              type="submit"
              size="sm"
              variant="outline"
              className="text-destructive"
              disabled={code.trim().length < 6 || disable.isPending}
            >
              {disable.isPending ? (
                <Loader2 aria-hidden className="mr-1.5 size-3.5 animate-spin" />
              ) : (
                <KeyRound aria-hidden className="mr-1.5 size-3.5" />
              )}
              Confirm
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => {
                setConfirming(false);
                setCode("");
              }}
            >
              Cancel
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
