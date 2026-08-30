import { createFileRoute } from "@tanstack/react-router";
import { TaveloMark, TaveloWordmark } from "@/components/admin/tavelo-logo";
import { KeyRound, Loader2, ShieldCheck, Smartphone } from "lucide-react";
import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ApiError, errorMessage } from "@/lib/api";
import {
  completeMfaChallenge,
  isMfaChallenge,
  loginWithGoogle,
  loginWithOtp,
  requestLoginOtp,
} from "@/lib/auth";
import { signInWithGoogleIdToken } from "@/lib/firebase";

type LoginSearch = { next?: string | undefined };

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): LoginSearch => ({
    next: typeof search["next"] === "string" ? (search["next"] as string) : undefined,
  }),
  head: () => ({
    meta: [
      { title: "Sign in · Tavelo Super Admin" },
      { name: "description", content: "Secure sign-in for Tavelo platform administrators." },
      { property: "og:title", content: "Sign in · Tavelo Super Admin" },
      {
        property: "og:description",
        content: "Secure sign-in for Tavelo platform administrators.",
      },
    ],
  }),
  component: LoginPage,
});

/** Only same-origin paths are accepted as a post-login destination. */
function safeNext(next?: string) {
  if (!next || !next.startsWith("/") || next.startsWith("//")) return "/";
  if (next.startsWith("/login")) return "/";
  return next;
}

/**
 * Copy for every failure the API can return. Nothing here reveals whether a
 * particular account is registered — that is a backend guarantee the UI must
 * not undo.
 */
function authErrorCopy(err: unknown): string {
  const code = err instanceof ApiError ? err.code : "";
  switch (code) {
    case "INVALID_OTP":
      return "That code is not valid. Check it and try again.";
    case "OTP_EXPIRED":
      return "That code has expired. Request a new one.";
    case "OTP_THROTTLED":
      return "Too many attempts. Wait a minute before trying again.";
    case "ADMIN_NOT_FOUND":
      return "This Google account cannot be used to sign in here.";
    case "ACCOUNT_BLOCKED":
    case "ACCOUNT_SUSPENDED":
      return "This account is not active. Contact platform support.";
    case "GOOGLE_SIGNIN_DISABLED":
      return "Google sign-in is not available on this deployment.";
    case "MFA_INVALID_CODE":
      return "That code is not valid. Try the current one from your authenticator, or a recovery code.";
    case "MFA_CHALLENGE_INVALID":
      return "This sign-in attempt has expired. Start again.";
    case "MFA_LOCKED":
      return errorMessage(err);
    default:
      return errorMessage(err);
  }
}

const RESEND_SECONDS = 45;

function GoogleMark() {
  return (
    <svg aria-hidden viewBox="0 0 18 18" className="mr-2 size-4">
      <path
        fill="#4285F4"
        d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z"
      />
      <path
        fill="#34A853"
        d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.81.54-1.85.86-3.04.86-2.34 0-4.32-1.58-5.03-3.7H.96v2.33A9 9 0 0 0 9 18Z"
      />
      <path
        fill="#FBBC05"
        d="M3.97 10.72a5.41 5.41 0 0 1 0-3.44V4.95H.96a9 9 0 0 0 0 8.1l3.01-2.33Z"
      />
      <path
        fill="#EA4335"
        d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.59C13.46.89 11.43 0 9 0A9 9 0 0 0 .96 4.95l3.01 2.33C4.68 5.16 6.66 3.58 9 3.58Z"
      />
    </svg>
  );
}

function LoginPage() {
  const { next } = Route.useSearch();

  const [mobile, setMobile] = useState("");
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [resendIn, setResendIn] = useState(0);

  // Set only when the first factor succeeded but the admin has TOTP enabled.
  // While this is non-null NO tokens exist yet — the server issues none until
  // the challenge is answered.
  const [mfaToken, setMfaToken] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");

  const [busy, setBusy] = useState<null | "google" | "otp-send" | "otp-verify" | "mfa">(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (resendIn <= 0) return;
    const timer = window.setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [resendIn]);

  // Full navigation so every provider re-reads the fresh session.
  const finish = () => window.location.assign(safeNext(next));

  const submitGoogle = async () => {
    setBusy("google");
    setError(null);
    setNotice(null);
    try {
      const idToken = await signInWithGoogleIdToken();
      const result = await loginWithGoogle(idToken);
      if (isMfaChallenge(result)) {
        setMfaToken(result.mfaToken);
        setBusy(null);
        return;
      }
      finish();
    } catch (err) {
      const code = (err as { code?: string } | null)?.code ?? "";
      if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request") {
        setError(null);
      } else if (code === "auth/popup-blocked") {
        setError("Your browser blocked the Google window. Allow popups and try again.");
      } else {
        setError(authErrorCopy(err));
      }
      setBusy(null);
    }
  };

  const sendOtp = async (e?: React.FormEvent) => {
    e?.preventDefault();
    setBusy("otp-send");
    setError(null);
    try {
      await requestLoginOtp(mobile.trim());
      setOtpSent(true);
      setResendIn(RESEND_SECONDS);
      setNotice("If this number is registered, a 6-digit code is on its way.");
    } catch (err) {
      setError(authErrorCopy(err));
    } finally {
      setBusy(null);
    }
  };

  const submitOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy("otp-verify");
    setError(null);
    try {
      const result = await loginWithOtp(mobile.trim(), otp.trim());
      if (isMfaChallenge(result)) {
        setMfaToken(result.mfaToken);
        setBusy(null);
        return;
      }
      finish();
    } catch (err) {
      setError(authErrorCopy(err));
      setBusy(null);
    }
  };

  const submitMfa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!mfaToken) return;
    setBusy("mfa");
    setError(null);
    try {
      await completeMfaChallenge(mfaToken, mfaCode.trim());
      finish();
    } catch (err) {
      // An expired or spent challenge cannot be retried — send them back to
      // the start rather than leaving them typing into a dead form.
      if (err instanceof ApiError && err.code === "MFA_CHALLENGE_INVALID") {
        setMfaToken(null);
        setMfaCode("");
        setOtpSent(false);
      }
      setError(authErrorCopy(err));
      setBusy(null);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden flex-col justify-between bg-sidebar p-10 lg:flex">
        <div className="flex items-center gap-2.5">
          <TaveloMark onDark className="h-8 w-auto" />
          <TaveloWordmark onDark className="h-[18px] w-auto" />
        </div>
        <div className="max-w-md">
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-sidebar-primary">
            Platform control plane
          </p>
          <h2 className="mt-3 text-3xl font-extrabold leading-tight text-sidebar-accent-foreground">
            Operate every hotel, subscription and rupee on the platform.
          </h2>
          <p className="mt-3 text-sm text-sidebar-foreground/80">
            Owners, properties, plans, billing and support — one console.
          </p>
        </div>
        <p className="text-xs text-sidebar-foreground/60">
          Internal access only. All sessions and actions are audited.
        </p>
      </div>

      <div className="flex items-center justify-center px-5 py-12">
        <div className="w-full max-w-sm">
          <div className="mb-6 flex items-center gap-2 lg:hidden">
            <TaveloMark className="h-7 w-auto" />
            <TaveloWordmark className="h-4 w-auto" />
          </div>
          <p className="eyebrow">Super Admin</p>
          <h1 className="mt-1 text-2xl font-bold">Sign in to continue</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {mfaToken
              ? "One more step: the 6-digit code from your authenticator app."
              : otpSent
                ? "Enter the 6-digit code we sent to your mobile."
                : "Continue with your Tavelo Google account, or a code sent to your registered mobile."}
          </p>

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-md border border-destructive/25 bg-destructive-soft px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          )}
          {!error && notice && (
            <div
              role="status"
              className="mt-4 rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-muted-foreground"
            >
              {notice}
            </div>
          )}

          {mfaToken ? (
            <form onSubmit={submitMfa} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="mfa-code">Authenticator code</Label>
                <Input
                  id="mfa-code"
                  inputMode="text"
                  autoComplete="one-time-code"
                  maxLength={32}
                  placeholder="123456"
                  className="tnum text-center text-lg tracking-[0.3em]"
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  required
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">
                  Lost your authenticator? Enter one of your recovery codes instead — each works
                  once.
                </p>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={busy !== null || mfaCode.trim().length < 6}
              >
                {busy === "mfa" ? (
                  <>
                    <Loader2 aria-hidden className="mr-2 size-4 animate-spin" /> Checking…
                  </>
                ) : (
                  <>
                    <ShieldCheck aria-hidden className="mr-2 size-4" /> Verify and sign in
                  </>
                )}
              </Button>
              <button
                type="button"
                className="w-full text-xs text-muted-foreground underline-offset-4 hover:underline"
                onClick={() => {
                  setMfaToken(null);
                  setMfaCode("");
                  setOtp("");
                  setOtpSent(false);
                  setError(null);
                  setNotice(null);
                }}
                disabled={busy !== null}
              >
                Start over
              </button>
            </form>
          ) : otpSent ? (
            <form onSubmit={submitOtp} className="mt-6 space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="signin-otp">6-digit code</Label>
                <Input
                  id="signin-otp"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  maxLength={6}
                  placeholder="123456"
                  className="tnum text-center text-lg tracking-[0.4em]"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                  required
                  autoFocus
                />
                <p className="text-xs text-muted-foreground">Sent to {mobile.trim()}</p>
              </div>
              <Button
                type="submit"
                className="w-full"
                disabled={busy !== null || otp.trim().length < 4}
              >
                {busy === "otp-verify" ? (
                  <>
                    <Loader2 aria-hidden className="mr-2 size-4 animate-spin" /> Verifying…
                  </>
                ) : (
                  <>
                    <KeyRound aria-hidden className="mr-2 size-4" /> Verify and sign in
                  </>
                )}
              </Button>
              <div className="flex items-center justify-between text-xs">
                <button
                  type="button"
                  className="text-muted-foreground underline-offset-4 hover:underline"
                  onClick={() => {
                    setOtpSent(false);
                    setOtp("");
                    setError(null);
                    setNotice(null);
                  }}
                  disabled={busy !== null}
                >
                  Use a different number
                </button>
                <button
                  type="button"
                  className="font-medium text-primary underline-offset-4 hover:underline disabled:text-muted-foreground disabled:no-underline"
                  onClick={() => void sendOtp()}
                  disabled={busy !== null || resendIn > 0}
                >
                  {resendIn > 0 ? `Resend in ${resendIn}s` : "Resend code"}
                </button>
              </div>
            </form>
          ) : (
            <>
              <Button
                type="button"
                className="mt-6 w-full"
                variant="outline"
                onClick={submitGoogle}
                disabled={busy !== null}
              >
                {busy === "google" ? (
                  <>
                    <Loader2 aria-hidden className="mr-2 size-4 animate-spin" /> Connecting…
                  </>
                ) : (
                  <>
                    <GoogleMark /> Continue with Google
                  </>
                )}
              </Button>

              <div className="my-6 flex items-center gap-3">
                <span className="h-px flex-1 bg-border" />
                <span className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
                  or
                </span>
                <span className="h-px flex-1 bg-border" />
              </div>

              <form onSubmit={sendOtp} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="mobile">Registered mobile</Label>
                  <Input
                    id="mobile"
                    type="tel"
                    inputMode="tel"
                    autoComplete="tel"
                    placeholder="98765 43210"
                    value={mobile}
                    onChange={(e) => setMobile(e.target.value)}
                    required
                  />
                  <p className="text-xs text-muted-foreground">
                    Indian numbers, with or without +91.
                  </p>
                </div>
                <Button type="submit" className="w-full" disabled={busy !== null}>
                  {busy === "otp-send" ? (
                    <>
                      <Loader2 aria-hidden className="mr-2 size-4 animate-spin" /> Sending code…
                    </>
                  ) : (
                    <>
                      <Smartphone aria-hidden className="mr-2 size-4" /> Send sign-in code
                    </>
                  )}
                </Button>
              </form>
            </>
          )}

          <p className="mt-6 text-xs text-muted-foreground">
            Owner, GM and staff portals are on a separate domain and cannot be accessed from here.
          </p>
        </div>
      </div>
    </div>
  );
}
