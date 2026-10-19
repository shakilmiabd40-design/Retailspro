"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { hardNavigate } from "@/lib/persist/nav";
import { api, HttpError } from "@/lib/persist/api";
import { passwordProblems } from "@/lib/settings/security";
import { AuthAlert, AuthButton, AuthCard, AuthField, PasswordInput } from "@/components/auth/auth-ui";
import { FALLBACK_SHOP_NAME } from "@/lib/settings/shop";

interface Me {
  user: { name: string; mustResetPassword: boolean };
  policy: { minPasswordLength: number; requireUppercase: boolean; requireNumber: boolean; requireSymbol: boolean };
}

export default function ChangePasswordPage() {
  const [me, setMe] = useState<Me | null>(null);
  const [shopName, setShopName] = useState(FALLBACK_SHOP_NAME);
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api<Me>("GET", "/api/auth/me")
      .then(setMe)
      .catch(() => hardNavigate("/login?next=/change-password"));
    api<{ shopName?: string | null }>("GET", "/api/auth/status")
      .then((s) => s.shopName?.trim() && setShopName(s.shopName.trim()))
      .catch(() => {});
  }, []);

  if (!me) return <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>;

  const forced = me.user.mustResetPassword;
  const problems = next ? passwordProblems(next, { ...me.policy, forceResetOnFirstLogin: true, sessionTimeoutMinutes: 0, twoFactorEnabled: false, maxLoginAttempts: 0, lockoutMinutes: 0 }) : [];

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (next !== confirm) return setError("The two new passwords don't match.");
    setBusy(true);
    try {
      await api("POST", "/api/auth/change-password", { currentPassword: current, newPassword: next });
      hardNavigate("/");
    } catch (err) {
      setError(err instanceof HttpError ? err.message : "Something went wrong.");
      setBusy(false);
    }
  }

  return (
    <AuthCard brand={shopName} title="Choose a new password" subtitle={forced ? `Hi ${me.user.name.split(" ")[0]} — for your security you need to replace your temporary password before continuing.` : "Changing it signs you out of your other devices."}>
      <form onSubmit={submit} className="space-y-4">
        <AuthField label={forced ? "Temporary password" : "Current password"}>
          <PasswordInput autoFocus autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
        </AuthField>
        <AuthField
          label="New password"
          hint={
            <>
              At least {me.policy.minPasswordLength} characters
              {me.policy.requireUppercase ? ", an uppercase letter" : ""}
              {me.policy.requireNumber ? ", a number" : ""}
              {me.policy.requireSymbol ? ", a symbol" : ""}.
            </>
          }
        >
          <PasswordInput autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />
        </AuthField>
        {problems.length > 0 && <p className="text-[12px]" style={{ color: "var(--text-faint)" }}>Still needs: {problems.join(", ").toLowerCase()}.</p>}
        <AuthField label="Confirm new password">
          <PasswordInput autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </AuthField>
        {error && <AuthAlert>{error}</AuthAlert>}
        <AuthButton type="submit" loading={busy}>
          Update password
        </AuthButton>
      </form>
      <p className="text-center text-[12.5px]">
        {forced ? (
          <button className="focus-ring underline" style={{ color: "var(--text-muted)" }} onClick={() => api("POST", "/api/auth/logout").finally(() => hardNavigate("/login"))}>
            Sign out instead
          </button>
        ) : (
          <Link href="/" style={{ color: "var(--text-muted)" }} className="underline">
            Cancel
          </Link>
        )}
      </p>
    </AuthCard>
  );
}
