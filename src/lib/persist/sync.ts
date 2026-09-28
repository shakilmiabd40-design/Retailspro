import { api, HttpError } from "./api";

export type SyncState = "idle" | "saving" | "offline" | "error";
export interface SyncStatus {
  state: SyncState;
  pending: boolean;
  lastSavedAt: number | null;
}
export interface SyncNotice {
  kind: "conflict" | "forbidden";
  message: string;
  /**
   * Which records the conflict/refusal was about, as "collectionName/id" (or "document/key"). Populated for
   * "conflict"; empty for "forbidden". A caller with its own compound, cross-collection write (e.g. a POS sale
   * that touches products and pos_invoices together) can check whether ITS records are in here before reacting —
   * a conflict on someone else's data elsewhere in the app is not its concern.
   */
  names: string[];
}

export interface Row {
  id: string;
  data: Record<string, unknown>;
  version: number;
}

interface AdapterBase {
  name: string;
  /** Last change counter seen from the server for this name. */
  rev: number;
  forbidden: boolean;
  loaded: () => boolean;
  applyForbidden: () => void;
}
export interface CollectionAdapter extends AdapterBase {
  kind: "collection";
  applyRows: (rows: Row[], rev: number) => void;
  collect: () => { upserts: { id: string; data: unknown; baseVersion: number }[]; deletes: string[]; commit: (versions: Record<string, number>) => void } | null;
}
export interface DocumentAdapter extends AdapterBase {
  kind: "document";
  force: boolean;
  applyDoc: (data: unknown | null, version: number, rev: number) => void;
  collect: () => { data: unknown; baseVersion: number; commit: (version: number) => void } | null;
}
type Adapter = CollectionAdapter | DocumentAdapter;

interface LoadResponse {
  collections: Record<string, { forbidden?: boolean; rev?: number; rows?: Row[] }>;
  documents: Record<string, { forbidden?: boolean; rev?: number; data?: unknown; version?: number }>;
}
interface SyncResponse {
  versions: Record<string, Record<string, number>>;
  documents: Record<string, number>;
  revs: Record<string, number>;
}

const FLUSH_DELAY = 300;
const POLL_EVERY = 15_000;
const RETRY_STEPS = [2_000, 5_000, 10_000, 30_000];

/**
 * Keeps React state (the app's stores) and the database in step:
 *  - loads every registered collection / document in one batched request,
 *  - sends only changed records, all together in one transaction,
 *  - notices other people's edits by polling a cheap change counter,
 *  - reloads (and tells the user) when someone else changed the same record first.
 */
class SyncManager {
  private adapters = new Map<string, Adapter>();
  private loadQueue = new Map<string, { force: boolean; passive: boolean }>();
  private loadTimer: ReturnType<typeof setTimeout> | null = null;
  private flushTimer: ReturnType<typeof setTimeout> | null = null;
  private pollTimer: ReturnType<typeof setInterval> | null = null;
  private inFlight = false;
  private again = false;
  private retryIndex = 0;
  private running = false;

  private status: SyncStatus = { state: "idle", pending: false, lastSavedAt: null };
  private statusListeners = new Set<() => void>();
  private noticeListeners = new Set<(n: SyncNotice) => void>();

  // ── subscriptions (React) ────────────────────────────────────────────────
  subscribe = (fn: () => void) => {
    this.statusListeners.add(fn);
    return () => this.statusListeners.delete(fn);
  };
  getStatus = () => this.status;
  onNotice(fn: (n: SyncNotice) => void) {
    this.noticeListeners.add(fn);
    return () => this.noticeListeners.delete(fn);
  }
  private setStatus(patch: Partial<SyncStatus>) {
    const next = { ...this.status, ...patch };
    if (next.state === this.status.state && next.pending === this.status.pending && next.lastSavedAt === this.status.lastSavedAt) return;
    this.status = next;
    this.statusListeners.forEach((l) => l());
  }
  private notice(n: SyncNotice) {
    this.noticeListeners.forEach((l) => l(n));
  }

  // ── registration ─────────────────────────────────────────────────────────
  register(a: Adapter) {
    this.adapters.set(a.name, a);
    this.start();
    this.queueLoad(a.name, { force: true, passive: false });
  }

  unregister(name: string) {
    this.adapters.delete(name);
    if (this.adapters.size === 0) this.stop();
  }

  private start() {
    if (this.running || typeof window === "undefined") return;
    this.running = true;
    this.pollTimer = setInterval(() => void this.poll(), POLL_EVERY);
    document.addEventListener("visibilitychange", this.onVisibility);
    window.addEventListener("focus", this.onFocus);
    window.addEventListener("online", this.onFocus);
    window.addEventListener("pagehide", this.onPageHide);
    window.addEventListener("beforeunload", this.onBeforeUnload);
  }

  private stop() {
    this.running = false;
    if (this.pollTimer) clearInterval(this.pollTimer);
    if (this.flushTimer) clearTimeout(this.flushTimer);
    if (this.loadTimer) clearTimeout(this.loadTimer);
    this.pollTimer = this.flushTimer = this.loadTimer = null;
    document.removeEventListener("visibilitychange", this.onVisibility);
    window.removeEventListener("focus", this.onFocus);
    window.removeEventListener("online", this.onFocus);
    window.removeEventListener("pagehide", this.onPageHide);
    window.removeEventListener("beforeunload", this.onBeforeUnload);
    this.loadQueue.clear();
    this.inFlight = false;
    this.again = false;
    this.status = { state: "idle", pending: false, lastSavedAt: null };
  }

  // ── loading ──────────────────────────────────────────────────────────────
  private queueLoad(name: string, opts: { force: boolean; passive: boolean }) {
    const prev = this.loadQueue.get(name);
    this.loadQueue.set(name, { force: (prev?.force ?? false) || opts.force, passive: (prev?.passive ?? true) && opts.passive });
    if (!this.loadTimer) this.loadTimer = setTimeout(() => void this.runLoad(), 0);
  }

  private async runLoad() {
    this.loadTimer = null;
    const queued = [...this.loadQueue.entries()];
    this.loadQueue.clear();
    const entries = queued.filter(([name]) => this.adapters.has(name));
    if (!entries.length) return;

    const cs = entries.filter(([n]) => this.adapters.get(n)!.kind === "collection").map(([n]) => n);
    const ds = entries.filter(([n]) => this.adapters.get(n)!.kind === "document").map(([n]) => n);
    const passive = entries.every(([, o]) => o.passive);

    try {
      const res = await api<LoadResponse>("GET", `/api/load?c=${cs.join(",")}&d=${ds.join(",")}`, undefined, { passive });
      for (const [name, opts] of entries) {
        const a = this.adapters.get(name);
        if (!a) continue;
        // A background refresh must never overwrite edits that haven't been saved yet.
        if (!opts.force && a.loaded() && (this.inFlight || a.collect())) continue;
        if (a.kind === "collection") {
          const r = res.collections[name];
          if (!r || r.forbidden) {
            a.forbidden = true;
            a.applyForbidden();
          } else a.applyRows(r.rows ?? [], r.rev ?? 0);
        } else {
          const r = res.documents[name];
          if (!r || r.forbidden) {
            a.forbidden = true;
            a.applyForbidden();
          } else a.applyDoc(r.data ?? null, r.version ?? 0, r.rev ?? 0);
        }
      }
      this.retryIndex = 0;
      if (this.status.state === "offline") this.setStatus({ state: "idle" });
    } catch (err) {
      if (err instanceof HttpError && (err.status === 401 || err.code === "password_change_required")) return;
      this.setStatus({ state: err instanceof HttpError && err.status === 0 ? "offline" : "error" });
      const delay = RETRY_STEPS[Math.min(this.retryIndex++, RETRY_STEPS.length - 1)];
      for (const [name, opts] of entries) this.loadQueue.set(name, opts);
      this.loadTimer = setTimeout(() => void this.runLoad(), delay);
    }
  }

  // ── saving ───────────────────────────────────────────────────────────────
  /** Called by the hooks whenever their state changes. */
  touch() {
    if (!this.running) return;
    this.setStatus({ pending: true });
    if (this.flushTimer) clearTimeout(this.flushTimer);
    this.flushTimer = setTimeout(() => void this.flush(), FLUSH_DELAY);
  }

  private hasPending(): boolean {
    if (this.inFlight) return true;
    for (const a of this.adapters.values()) if (a.loaded() && !a.forbidden && a.collect()) return true;
    return false;
  }

  private async flush() {
    this.flushTimer = null;
    if (this.inFlight) {
      this.again = true;
      return;
    }

    type Batch = { a: Adapter; c: NonNullable<ReturnType<Adapter["collect"]>> };
    const batch: Batch[] = [];
    const body: { collections: Record<string, unknown>; documents: Record<string, unknown> } = { collections: {}, documents: {} };
    for (const a of this.adapters.values()) {
      if (!a.loaded() || a.forbidden) continue;
      const c = a.collect();
      if (!c) continue;
      batch.push({ a, c } as Batch);
      if (a.kind === "collection") {
        const cc = c as NonNullable<ReturnType<CollectionAdapter["collect"]>>;
        body.collections[a.name] = { upserts: cc.upserts, deletes: cc.deletes };
      } else {
        const dc = c as NonNullable<ReturnType<DocumentAdapter["collect"]>>;
        body.documents[a.name] = { data: dc.data, baseVersion: dc.baseVersion, force: a.force };
      }
    }
    if (!batch.length) {
      this.setStatus({ pending: false, state: this.status.state === "saving" ? "idle" : this.status.state });
      return;
    }

    this.inFlight = true;
    this.setStatus({ state: "saving", pending: true });
    try {
      const res = await api<SyncResponse>("POST", "/api/sync", body);
      for (const { a, c } of batch) {
        if (a.kind === "collection") (c as NonNullable<ReturnType<CollectionAdapter["collect"]>>).commit(res.versions[a.name] ?? {});
        else (c as NonNullable<ReturnType<DocumentAdapter["collect"]>>).commit(res.documents[a.name] ?? 1);
        // If nobody else wrote in between, our own bump is the only change — no need to reload it.
        if (res.revs[a.name] === a.rev + 1) a.rev = res.revs[a.name];
      }
      this.retryIndex = 0;
      this.setStatus({ state: "idle", lastSavedAt: Date.now() });
    } catch (err) {
      this.inFlight = false;
      if (err instanceof HttpError && err.status === 409) {
        const raw = (err.data?.conflicts as string[] | undefined) ?? [];
        const names = new Set(raw.map((c) => (c.startsWith("document/") ? c.slice(9) : c.split("/")[0])));
        for (const { a } of batch) if (!names.size || names.has(a.name)) this.queueLoad(a.name, { force: true, passive: false });
        this.notice({ kind: "conflict", message: "Someone else changed the same data first — it was reloaded. Please repeat your last change.", names: raw });
        this.setStatus({ state: "idle" });
      } else if (err instanceof HttpError && err.status === 403 && err.code === "forbidden") {
        for (const { a } of batch) this.queueLoad(a.name, { force: true, passive: false });
        this.notice({ kind: "forbidden", message: err.message, names: batch.map(({ a }) => a.name) });
        this.setStatus({ state: "idle" });
      } else if (err instanceof HttpError && (err.status === 401 || err.code === "password_change_required")) {
        /* the auth handler takes over */
      } else {
        this.setStatus({ state: err instanceof HttpError && err.status === 0 ? "offline" : "error" });
        const delay = RETRY_STEPS[Math.min(this.retryIndex++, RETRY_STEPS.length - 1)];
        this.flushTimer = setTimeout(() => void this.flush(), delay);
      }
    } finally {
      this.inFlight = false;
      if (this.again) {
        this.again = false;
        this.touch();
      } else if (!this.flushTimer) {
        this.setStatus({ pending: this.hasPending() });
      }
    }
  }

  /** Save right now (used before sign-out). */
  async flushNow() {
    if (this.flushTimer) clearTimeout(this.flushTimer);
    await this.flush();
    if (this.inFlight) await new Promise((r) => setTimeout(r, 400));
  }

  // ── other people's edits ─────────────────────────────────────────────────
  private async poll() {
    if (typeof document !== "undefined" && document.hidden) return;
    if (this.inFlight || !this.adapters.size) return;
    const names = [...this.adapters.values()].filter((a) => a.loaded() && !a.forbidden).map((a) => a.name);
    if (!names.length) return;
    try {
      const { revs } = await api<{ revs: Record<string, number> }>("GET", `/api/revs?n=${names.join(",")}`, undefined, { passive: true });
      for (const name of names) {
        const a = this.adapters.get(name);
        if (a && (revs[name] ?? 0) !== a.rev) this.queueLoad(name, { force: false, passive: true });
      }
      if (this.status.state === "offline") this.setStatus({ state: "idle" });
    } catch (err) {
      if (err instanceof HttpError && err.status === 0) this.setStatus({ state: "offline" });
    }
  }

  private onVisibility = () => {
    if (document.hidden) void this.flushNow();
    else void this.poll();
  };
  private onFocus = () => void this.poll();

  private onPageHide = () => {
    // Last-chance save for edits made in the final moments before the tab closes.
    const body: { collections: Record<string, unknown>; documents: Record<string, unknown> } = { collections: {}, documents: {} };
    let any = false;
    for (const a of this.adapters.values()) {
      if (!a.loaded() || a.forbidden) continue;
      const c = a.collect();
      if (!c) continue;
      any = true;
      if (a.kind === "collection") {
        const cc = c as NonNullable<ReturnType<CollectionAdapter["collect"]>>;
        body.collections[a.name] = { upserts: cc.upserts, deletes: cc.deletes };
      } else {
        const dc = c as NonNullable<ReturnType<DocumentAdapter["collect"]>>;
        body.documents[a.name] = { data: dc.data, baseVersion: dc.baseVersion, force: a.force };
      }
    }
    if (!any || this.inFlight) return;
    try {
      const blob = new Blob([JSON.stringify(body)], { type: "application/json" });
      if (blob.size < 60_000) navigator.sendBeacon("/api/sync", blob);
    } catch {
      /* best effort */
    }
  };

  private onBeforeUnload = (e: BeforeUnloadEvent) => {
    if (this.status.state === "offline" || this.status.state === "error") {
      if (this.hasPending()) {
        e.preventDefault();
        e.returnValue = "";
      }
    }
  };
}

export const syncManager = new SyncManager();
