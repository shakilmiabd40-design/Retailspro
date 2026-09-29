"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { hardNavigate } from "@/lib/persist/nav";
import { api, HttpError } from "@/lib/persist/api";
import { AuthAlert, AuthButton, AuthCard, AuthField, AuthInput, PasswordInput, safeNext } from "@/components/auth/auth-ui";
import { FALLBACK_SHOP_NAME } from "@/lib/settings/shop";

interface Status {
  configured: boolean;
  ready: boolean;
  needsSetup: boolean;
  setupTokenRequired?: boolean;
  unreachable?: boolean;
  message?: string;
  shopName?: string;
}

function Code({ children }: { children: React.ReactNode }) {
  return (
    <code className="block overflow-x-auto rounded-lg px-3 py-2 text-[12px]" style={{ background: "var(--surface-2)", color: "var(--text)" }}>
      {children}
    </code>
  );
}

function NotReady({ status }: { status: Status }) {
  return (
    <AuthCard brand={status.shopName?.trim() || FALLBACK_SHOP_NAME} title={status.configured ? (status.unreachable ? "Can't reach the database" : "Database not set up yet") : "Connect your database"} subtitle="This app stores everything in PostgreSQL — Neon, Aiven or any other provider.">
      {!status.configured ? (
        <ol className="list-decimal space-y-3 pl-5 text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          <li>
            Copy your connection string from the Neon or Aiven console and put it in <b style={{ color: "var(--text)" }}>.env.local</b>:
            <div className="mt-1.5">
              <Code>DATABASE_URL=postgresql://user:password@host/dbname?sslmode=require</Code>
            </div>
          </li>
          <li>
            Create the tables once: <Code>npm run db:setup</Code>
          </li>
          <li>Restart the app and reload this page.</li>
        </ol>
      ) : status.unreachable ? (
        <p className="text-[13px] leading-relaxed" style={{ color: "var(--text-muted)" }}>
          The server couldn&apos;t connect to your database. Check that <b style={{ color: "var(--text)" }}>DATABASE_URL</b> is correct and that the database allows connections from this server. For Aiven you can also set <b style={{ color: "var(--text)" }}>DATABASE_CA_CERT</b>.
        </p>
      ) : (
        <div className="space-y-2 text-[13px]" style={{ color: "var(--text-muted)" }}>
          <p>The connection works, but the tables don&apos;t exist yet. Run this once, then reload:</p>
          <Code>npm run db:setup</Code>
        </div>
      )}
      <AuthButton type="button" onClick={() => window.location.reload()}>
        Check again
      </AuthButton>
    </AuthCard>
  );
}

function SetupForm({ status, next }: { status: Status; next: string }) {
  const [form, setForm] = useState({ shopName: "", name: "", email: "", password: "", confirm: "", sampleData: false, setupToken: "" });
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof form, v: string | boolean) => setForm((f) => ({ ...f, [k]: v }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (form.password !== form.confirm) return setError("The two passwords don't match.");
    setBusy(true);
    try {
      await api("POST", "/api/auth/setup", { shopName: form.shopName, name: form.name, email: form.email, password: form.password, sampleData: form.sampleData, setupToken: form.setupToken });
      hardNavigate(next);
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <AuthCard brand={form.shopName.trim() || "Welcome"} title="Welcome — let's set up" subtitle="Create the first account. It becomes the Super Admin, who can add everyone else later.">
      <form onSubmit={submit} className="space-y-4">
        <AuthField label="Shop or company name" hint="Shown across the app — sidebar, invoices, emails. You can change it later in Settings → Company.">
          <AuthInput autoFocus required value={form.shopName} onChange={(e) => set("shopName", e.target.value)} placeholder="e.g. Karim Footwear" />
        </AuthField>
        <AuthField label="Your name">
          <AuthInput autoComplete="name" required value={form.name} onChange={(e) => set("name", e.target.value)} />
        </AuthField>
        <AuthField label="Email or username">
          <AuthInput autoComplete="username" required value={form.email} onChange={(e) => set("email", e.target.value)} />
        </AuthField>
        <AuthField label="Password" hint="At least 8 characters, with an uppercase letter and a number.">
          <PasswordInput autoComplete="new-password" required value={form.password} onChange={(e) => set("password", e.target.value)} />
        </AuthField>
        <AuthField label="Confirm password">
          <PasswordInput autoComplete="new-password" required value={form.confirm} onChange={(e) => set("confirm", e.target.value)} />
        </AuthField>
        {status.setupTokenRequired && (
          <AuthField label="Setup token" hint="The SETUP_TOKEN value from your server's environment.">
            <PasswordInput required value={form.setupToken} onChange={(e) => set("setupToken", e.target.value)} />
          </AuthField>
        )}
        <label className="flex cursor-pointer items-start gap-2.5 text-[13px]" style={{ color: "var(--text-muted)" }}>
          <input type="checkbox" checked={form.sampleData} onChange={(e) => set("sampleData", e.target.checked)} className="mt-0.5 h-4 w-4 accent-[var(--brand)]" />
          <span>
            Start with sample data <span style={{ color: "var(--text-faint)" }}>(demo products, orders and suppliers — handy for a look around)</span>
          </span>
        </label>
        {error && <AuthAlert>{error}</AuthAlert>}
        <AuthButton type="submit" loading={busy}>
          Create account &amp; continue
        </AuthButton>
      </form>
    </AuthCard>
  );
}

function SignInForm({ shopName, next, expired }: { shopName: string; next: string; expired: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      const res = await api<{ mustResetPassword: boolean }>("POST", "/api/auth/login", { email, password });
      // A full page load starts the signed-in app with clean state.
      hardNavigate(res.mustResetPassword ? "/change-password" : next);
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Something went wrong.");
      setPassword("");
      setBusy(false);
    }
  }

  return (
    <AuthCard brand={shopName} title="Sign in" subtitle="Use the email or username your administrator gave you.">
      {expired && <AuthAlert tone="info">You were signed out after being inactive. Please sign in again.</AuthAlert>}
      <form onSubmit={submit} className="space-y-4">
        <AuthField label="Email or username">
          <AuthInput autoFocus autoComplete="username" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </AuthField>
        <AuthField label="Password">
          <PasswordInput autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </AuthField>
        {error && <AuthAlert>{error}</AuthAlert>}
        <AuthButton type="submit" loading={busy}>
          Sign in
        </AuthButton>
      </form>
      <p className="text-center text-[12px]" style={{ color: "var(--text-faint)" }}>
        Forgot your password? Ask a Super Admin to reset it for you.
      </p>
    </AuthCard>
  );
}

function LoginScreen() {
  const params = useSearchParams();
  const next = safeNext(params.get("next"));
  const [status, setStatus] = useState<Status | null>(null);

  useEffect(() => {
    let cancelled = false;
    // Already signed in? Skip straight to the app.
    api<{ user: { mustResetPassword: boolean } }>("GET", "/api/auth/me")
      .then((res) => {
        if (!cancelled) hardNavigate(res.user.mustResetPassword ? "/change-password" : next);
      })
      .catch(() => undefined);
    api<Status>("GET", "/api/auth/status")
      .then((s) => !cancelled && setStatus(s))
      .catch(() => !cancelled && setStatus({ configured: true, ready: false, needsSetup: false, unreachable: true }));
    return () => {
      cancelled = true;
    };
  }, [next]);

  if (!status) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;
  if (!status.configured || !status.ready) return <NotReady status={status} />;
  if (status.needsSetup) return <SetupForm status={status} next={next} />;
  return <SignInForm shopName={status.shopName?.trim() || FALLBACK_SHOP_NAME} next={next} expired={params.get("expired") === "1"} />;
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginScreen />
    </Suspense>
  );
}
