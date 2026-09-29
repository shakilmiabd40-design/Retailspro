/* eslint-disable @next/next/no-location-assign-relative-destination -- full page loads are deliberate here: they wipe the previous session's data from memory */
"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import type { Role } from "@/lib/settings/types";
import { api, AUTH_EVENT, HttpError, type AuthProblem } from "@/lib/persist/api";
import { syncManager } from "@/lib/persist/sync";
import { prefetchNumbers, releaseNumbers, releaseNumbersNow, resetNumbers } from "@/lib/persist/numbers";

export interface SessionUser {
  id: string;
  name: string;
  email: string;
  phone: string;
  roleId: string;
  status: "active" | "blocked";
  mustResetPassword: boolean;
  lastLogin: string | null;
  role: Role;
}
export interface PasswordPolicy {
  minPasswordLength: number;
  requireUppercase: boolean;
  requireNumber: boolean;
  requireSymbol: boolean;
}

interface AuthContextValue {
  user: SessionUser;
  policy: PasswordPolicy;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

const TOUCH_EVERY_MS = 60_000;

/** Set once we start leaving for /login so several failing requests don't each trigger a redirect. */
let leaving = false;

/** Where to send someone who has to sign in (keeps them on the page they wanted). */
export function loginUrl(reason?: string, next?: string) {
  const params = new URLSearchParams();
  if (reason) params.set(reason, "1");
  if (next && next !== "/") params.set("next", next);
  const q = params.toString();
  return `/login${q ? `?${q}` : ""}`;
}

/**
 * Wraps the signed-in part of the app. Nothing below it mounts (and no data is fetched) until the
 * server confirms the session, and any 401 from anywhere sends the person back to /login.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [session, setSession] = useState<{ user: SessionUser; policy: PasswordPolicy } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const goToLogin = useCallback((reason?: string) => {
    if (leaving) return;
    leaving = true;
    window.location.assign(loginUrl(reason, window.location.pathname + window.location.search));
  }, []);

  useEffect(() => {
    let cancelled = false;
    api<{ user: SessionUser; policy: PasswordPolicy }>("GET", "/api/auth/me")
      .then((res) => {
        if (cancelled) return;
        if (res.user.mustResetPassword) {
          leaving = true;
          window.location.assign("/change-password");
          return;
        }
        setSession(res);
      })
      .catch((err) => {
        if (cancelled) return;
        if (err instanceof HttpError && err.status === 401) return goToLogin();
        if (err instanceof HttpError && err.code === "password_change_required") {
          window.location.assign("/change-password");
          return;
        }
        setError(err instanceof HttpError && err.status !== 0 ? err.message : "Can't reach the server. Check your connection and reload.");
      });
    return () => {
      cancelled = true;
    };
  }, [goToLogin]);

  // Any request that comes back 401 / "must change password" ends up here.
  useEffect(() => {
    const onProblem = (e: Event) => {
      const { kind } = (e as CustomEvent<AuthProblem>).detail;
      if (kind === "password_change_required") {
        window.location.assign("/change-password");
      } else goToLogin(kind === "session_expired" ? "expired" : undefined);
    };
    window.addEventListener(AUTH_EVENT, onProblem);
    return () => window.removeEventListener(AUTH_EVENT, onProblem);
  }, [goToLogin]);

  // Tell the server the person is still here, so the inactivity timeout only counts real idleness.
  useEffect(() => {
    if (!session) return;
    let active = false;
    let last = Date.now();
    const mark = () => {
      active = true;
    };
    const events = ["pointerdown", "keydown", "scroll"] as const;
    events.forEach((ev) => window.addEventListener(ev, mark, { passive: true }));
    const timer = setInterval(() => {
      if (active && Date.now() - last >= TOUCH_EVERY_MS) {
        active = false;
        last = Date.now();
        api("POST", "/api/auth/touch").catch(() => {});
      }
    }, 15_000);
    prefetchNumbers();
    const onHide = () => releaseNumbers();
    window.addEventListener("pagehide", onHide);
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, mark));
      clearInterval(timer);
      window.removeEventListener("pagehide", onHide);
    };
  }, [session]);

  // Navigating counts as activity too.
  useEffect(() => {
    if (session) api("POST", "/api/auth/touch").catch(() => {});
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  const signOut = useCallback(async () => {
    leaving = true;
    await syncManager.flushNow().catch(() => {});
    await releaseNumbersNow();
    resetNumbers();
    await api("POST", "/api/auth/logout").catch(() => {});
    // A full page load guarantees no data from this session stays in memory.
    window.location.assign("/login");
  }, []);

  const value = useMemo<AuthContextValue | null>(() => (session ? { user: session.user, policy: session.policy, signOut } : null), [session, signOut]);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6" style={{ background: "var(--bg)" }}>
        <div className="card max-w-sm space-y-3 p-8 text-center">
          <p className="text-[15px] font-semibold" style={{ color: "var(--text)" }}>
            Couldn&apos;t load your session
          </p>
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
            {error}
          </p>
          <button onClick={() => window.location.reload()} className="focus-ring rounded-xl px-4 py-2 text-[13px] font-semibold text-white" style={{ background: "var(--brand)" }}>
            Reload
          </button>
        </div>
      </div>
    );
  }

  if (!value) {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ background: "var(--bg)" }}>
        <div className="h-8 w-8 animate-spin rounded-full border-2 border-t-transparent" style={{ borderColor: "var(--brand)", borderTopColor: "transparent" }} aria-label="Loading" />
      </div>
    );
  }

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within an AuthProvider");
  return ctx;
}
