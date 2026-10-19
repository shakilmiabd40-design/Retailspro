export class HttpError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public data?: Record<string, unknown>
  ) {
    super(message);
  }
}

export const AUTH_EVENT = "rp:auth-problem";

export interface AuthProblem {
  kind: "unauthenticated" | "session_expired" | "password_change_required";
}

function emitAuth(problem: AuthProblem) {
  if (typeof window !== "undefined") window.dispatchEvent(new CustomEvent<AuthProblem>(AUTH_EVENT, { detail: problem }));
}

/** JSON fetch to our own API. Signals the app when the session ended or a password change is required. */
export async function api<T = Record<string, unknown>>(method: "GET" | "POST" | "PATCH" | "DELETE", path: string, body?: unknown, opts: { passive?: boolean; keepalive?: boolean } = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, {
      method,
      credentials: "same-origin",
      headers: { ...(body !== undefined ? { "content-type": "application/json" } : {}), ...(opts.passive ? { "x-rp-passive": "1" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
      keepalive: opts.keepalive,
      cache: "no-store",
    });
  } catch {
    throw new HttpError(0, "network", "Can't reach the server.");
  }

  let data: Record<string, unknown> | undefined;
  try {
    data = (await res.json()) as Record<string, unknown>;
  } catch {
    /* empty or non-JSON body */
  }

  if (!res.ok) {
    const code = String(data?.error ?? "error");
    const message = String(data?.message ?? `Request failed (${res.status})`);
    if (res.status === 401) emitAuth({ kind: code === "session_expired" ? "session_expired" : "unauthenticated" });
    if (res.status === 403 && code === "password_change_required") emitAuth({ kind: "password_change_required" });
    throw new HttpError(res.status, code, message, data);
  }
  return data as T;
}
