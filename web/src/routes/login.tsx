import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { KeyRound, Loader2, ShieldCheck } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Sign in · Travelo Super Admin" },
      { name: "description", content: "Secure sign-in for Travelo platform administrators." },
      { property: "og:title", content: "Sign in · Travelo Super Admin" },
      { property: "og:description", content: "Secure sign-in for Travelo platform administrators." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [step, setStep] = useState<"credentials" | "mfa">("credentials");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    setTimeout(() => {
      setBusy(false);
      if (step === "credentials") setStep("mfa");
      else navigate({ to: "/" });
    }, 700);
  };

  return (
    <div className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <div className="hidden flex-col justify-between bg-sidebar p-10 lg:flex">
        <div className="flex items-center gap-2">
          <span className="flex size-8 items-center justify-center rounded-md bg-sidebar-primary text-sm font-black text-sidebar-primary-foreground">
            T
          </span>
          <span className="text-sm font-extrabold tracking-tight text-sidebar-accent-foreground">
            TRAVELO
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
            184 owners · 612 properties · 48,204 rooms under management.
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
            <span className="text-sm font-extrabold tracking-tight">TRAVELO</span>
          </div>
          <p className="eyebrow">Super Admin</p>
          <h1 className="mt-1 text-2xl font-bold">
            {step === "credentials" ? "Sign in to continue" : "Two-factor verification"}
          </h1>
          <p className="mt-1.5 text-sm text-muted-foreground">
            {step === "credentials"
              ? "Use your Travelo administrator account."
              : "Enter the 6-digit code from your authenticator app."}
          </p>

          {error && (
            <div role="alert" className="mt-4 rounded-md border border-destructive/25 bg-destructive-soft px-3 py-2 text-sm text-destructive">
              {error}
            </div>
          )}

          <form onSubmit={submit} className="mt-6 space-y-4">
            {step === "credentials" ? (
              <>
                <div className="space-y-1.5">
                  <Label htmlFor="email">Work email</Label>
                  <Input id="email" type="email" autoComplete="username" defaultValue="john@travelo.io" required />
                </div>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <Label htmlFor="password">Password</Label>
                    <button
                      type="button"
                      onClick={() => setError("Password reset link sent to your work email.")}
                      className="text-xs font-medium text-primary hover:underline"
                    >
                      Forgot password?
                    </button>
                  </div>
                  <Input id="password" type="password" autoComplete="current-password" defaultValue="••••••••••" required />
                </div>
                <div className="flex items-center gap-2">
                  <Checkbox id="remember" defaultChecked />
                  <Label htmlFor="remember" className="text-sm font-normal text-muted-foreground">
                    Remember this device for 30 days
                  </Label>
                </div>
              </>
            ) : (
              <div className="space-y-1.5">
                <Label htmlFor="otp">Authentication code</Label>
                <Input
                  id="otp"
                  inputMode="numeric"
                  maxLength={6}
                  placeholder="123456"
                  className="tnum text-center text-lg tracking-[0.4em]"
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Lost your device? Contact another Super Admin for recovery.
                </p>
              </div>
            )}

            <Button type="submit" className="w-full" disabled={busy}>
              {busy ? (
                <>
                  <Loader2 aria-hidden className="mr-2 size-4 animate-spin" /> Verifying…
                </>
              ) : step === "credentials" ? (
                <>
                  <KeyRound aria-hidden className="mr-2 size-4" /> Continue
                </>
              ) : (
                <>
                  <ShieldCheck aria-hidden className="mr-2 size-4" /> Verify &amp; sign in
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
