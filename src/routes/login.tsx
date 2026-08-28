import { createFileRoute } from "@tanstack/react-router";
import { KeyRound, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { errorMessage } from "@/lib/api";
import { login } from "@/lib/auth";

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

function LoginPage() {
  const { next } = Route.useSearch();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [mfaCode, setMfaCode] = useState("");
  const [needsMfa, setNeedsMfa] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await login(email.trim(), password, needsMfa ? mfaCode.trim() : undefined);
      // Full navigation so every provider re-reads the fresh session.
      window.location.assign(safeNext(next));
    } catch (err) {
      const message = errorMessage(err);
      if (/mfa|two.?factor|otp/i.test(message)) setNeedsMfa(true);
      setError(message);
      setBusy(false);
    }
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden flex-col justify-between bg-sidebar p-10 lg:flex">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sm font-black text-sidebar-primary-foreground">
            T
          </span>
          <span className="text-sm font-extrabold tracking-tight text-sidebar-accent-foreground">
            TAVELO
          </span>
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
            <span className="flex size-7 items-center justify-center rounded-md bg-primary text-xs font-black text-primary-foreground">
              T
            </span>
            <span className="text-sm font-extrabold tracking-tight">TAVELO</span>
          </div>
          <p className="eyebrow">Super Admin</p>
          <h1 className="mt-1 text-2xl font-bold">Sign in to continue</h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            Use your Tavelo administrator account.
          </p>

          {error && (
            <div
              role="alert"
              className="mt-4 rounded-md border border-destructive/25 bg-destructive-soft px-3 py-2 text-sm text-destructive"
            >
              {error}
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email">Work email</Label>
              <Input
                id="email"
                type="email"
                autoComplete="username"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            {needsMfa && (
              <div className="space-y-1.5">
                <Label htmlFor="otp">Authentication code</Label>
                <Input
                  id="otp"
                  inputMode="numeric"
                  maxLength={6}
                  value={mfaCode}
                  onChange={(e) => setMfaCode(e.target.value)}
                  placeholder="123456"
                  className="tnum text-center text-lg tracking-[0.4em]"
                  required
                />
              </div>
            )}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 aria-hidden className="mr-2 size-4 animate-spin" /> Signing in…
                </>
              ) : (
                <>
                  <KeyRound aria-hidden className="mr-2 size-4" /> Sign in
                </>
              )}
            </Button>
          </form>

          <p className="mt-6 text-xs text-muted-foreground">
            Owner, GM and staff portals are on a separate domain and cannot be accessed from here.
          </p>
        </div>
      </div>
    </div>
  );
}
