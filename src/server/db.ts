import "server-only";
import { Pool, type PoolClient, type QueryResultRow } from "pg";

/**
 * One PostgreSQL pool for the whole server, configured from DATABASE_URL.
 * Works with Neon, Aiven or any other Postgres — only the connection string differs:
 *
 *   Neon : postgresql://USER:PASSWORD@ep-xxxx-pooler.REGION.aws.neon.tech/DB?sslmode=require
 *   Aiven: postgres://avnadmin:PASSWORD@HOST.aivencloud.com:PORT/defaultdb?sslmode=require
 *
 * TLS is decided here instead of being left to `pg`'s connection-string parsing, which has
 * changed behaviour between versions:
 *   DATABASE_SSL=disable                  plain TCP (local Postgres only)
 *   DATABASE_CA_CERT=<PEM>                verify the server against this CA (recommended for Aiven)
 *   DATABASE_SSL_REJECT_UNAUTHORIZED=false  encrypt but skip certificate verification
 * With none of these: Neon & other public-CA hosts are fully verified; *.aivencloud.com (whose CA
 * isn't in Node's trust store) is encrypted but not verified, and a warning is logged once.
 */

declare global {
  var __inventoryProPool: Pool | undefined;
  var __inventoryProPoolWarned: boolean | undefined;
}

/**
 * Serverless hosts (Vercel, Netlify, Lambda) run every request in its own short-lived process, so
 * each instance is a separate pool and a separate set of database connections. That is why the
 * pool here is deliberately tiny and gives its connection back as soon as the work is done.
 */
const isServerless = !!(process.env.VERCEL || process.env.VERCEL_ENV || process.env.AWS_LAMBDA_FUNCTION_NAME || process.env.NETLIFY);

/** "Too many connections" from Postgres (53300 = too_many_connections, 53400 = configuration_limit_exceeded). Raised while connecting, before any SQL runs, so retrying is always safe. */
export function isDbBusyError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  if (e?.code === "53300" || e?.code === "53400") return true;
  const msg = e?.message ?? "";
  // "timeout exceeded when trying to connect" is what node-postgres says when it could not get a
  // connection in time (the pool was busy) — same story, same answer.
  return /remaining connection slots|too many (clients|connections)|sorry, too many|timeout exceeded when trying to connect/i.test(msg);
}

/**
 * A connection that died before the statement was sent — the statement never ran, so it is safe to
 * try again on a fresh pool. Deliberately narrow: a pool that is merely busy is NOT a dead
 * connection, and throwing the pool away would kill work that is still running in it.
 */
function isConnectFailure(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return /connection terminated due to connection error|client has encountered a connection error/i.test(e?.message ?? "");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RETRY_DELAYS_MS = [150, 400, 900, 1800, 3000];
/** Total time spent waiting for the database to free up a connection slot, before giving up. */
const BUSY_BUDGET_MS = 8_000;

/** Retries only the "database has no free connection slot right now" failure, with a short jittered back-off. */
async function whileBusy<T>(fn: () => Promise<T>): Promise<T> {
  const deadline = Date.now() + BUSY_BUDGET_MS;
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isDbBusyError(err) || Date.now() >= deadline) throw err;
      await sleep(RETRY_DELAYS_MS[Math.min(attempt, RETRY_DELAYS_MS.length - 1)] + Math.random() * 150);
    }
  }
}

export class DbNotConfiguredError extends Error {
  constructor() {
    super("DATABASE_URL is not set.");
    this.name = "DbNotConfiguredError";
  }
}

export function isDbConfigured(): boolean {
  const url = process.env.DATABASE_URL;
  return !!url && !url.includes("REPLACE-WITH-YOUR-HOST") && !url.includes("REPLACE_WITH_YOUR_PASSWORD");
}

function sslFor(host: string) {
  const mode = (process.env.DATABASE_SSL ?? "").toLowerCase();
  const local = host === "localhost" || host === "127.0.0.1" || host === "::1";
  if (mode === "disable" || (!mode && local)) return false as const;

  const ca = process.env.DATABASE_CA_CERT?.replace(/\\n/g, "\n").trim();
  if (ca) return { ca, rejectUnauthorized: true };

  const explicit = process.env.DATABASE_SSL_REJECT_UNAUTHORIZED;
  if (explicit === "false") return { rejectUnauthorized: false };
  if (explicit === "true") return { rejectUnauthorized: true };

  if (/\.(aivencloud\.com|aiven\.io)$/i.test(host)) {
    if (!globalThis.__inventoryProPoolWarned) {
      globalThis.__inventoryProPoolWarned = true;
      console.warn("[db] Aiven connection is encrypted but the server certificate isn't verified. Set DATABASE_CA_CERT to your service's CA certificate to verify it.");
    }
    return { rejectUnauthorized: false };
  }
  return { rejectUnauthorized: true };
}

export function getPool(): Pool {
  if (!isDbConfigured()) throw new DbNotConfiguredError();
  if (!globalThis.__inventoryProPool) {
    const url = new URL(process.env.DATABASE_URL!);
    globalThis.__inventoryProPool = new Pool({
      user: decodeURIComponent(url.username),
      password: decodeURIComponent(url.password),
      host: url.hostname,
      port: url.port ? Number(url.port) : 5432,
      database: url.pathname.replace(/^\//, "") || undefined,
      ssl: sslFor(url.hostname),
      // Small on purpose: every server instance (each serverless function, each dev/prod process) keeps its own pool,
      // and hosted databases allow few connections in total (Aiven free = 20, some reserved for Aiven itself).
      // One per instance leaves room for ~15 concurrent instances; set DATABASE_POOL_MAX=1 on serverless.
      max: Number(process.env.DATABASE_POOL_MAX ?? 1),
      // Close idle connections quickly. On a serverless host the instance is frozen between requests and a
      // frozen instance never runs its timers, so a connection that is only closed "after N ms idle" stays
      // open on the database until the socket dies — that is what eats up the connection slots.
      idleTimeoutMillis: isServerless ? 3_000 : 10_000,
      // Fail fast with the friendly "database is busy" answer instead of waiting past the platform's
      // function timeout (which would kill the instance and lose the request).
      connectionTimeoutMillis: isServerless ? 5_000 : 30_000,
      maxUses: 7500,
      // TCP keepalive so the database notices a socket that died while the instance was asleep.
      keepAlive: true,
      keepAliveInitialDelayMillis: 30_000,
      // Lets the process exit (and the connection close) when nothing is using the pool. Without this the
      // pool's idle timer keeps the event loop alive and the connection is never given back.
      allowExitOnIdle: true,
      // Shows up in Aiven's connection inspector, so it's obvious which instance holds the slots.
      application_name: process.env.VERCEL_GIT_COMMIT_SHA ? `retailspro-${process.env.VERCEL_GIT_COMMIT_SHA.slice(0, 7)}` : "retailspro",
    });
    globalThis.__inventoryProPool.on("error", (err) => console.error("[db] idle client error", err.message));
  }
  return globalThis.__inventoryProPool;
}

/**
 * Throws the current pool away so the next call opens fresh connections. Used when the pool is
 * holding connections that are no longer usable (the instance was asleep and the database dropped them).
 */
function resetPool() {
  const pool = globalThis.__inventoryProPool;
  globalThis.__inventoryProPool = undefined;
  if (pool) {
    // Don't wait for it — the clients we're dropping are dead anyway.
    pool.end().catch(() => {});
  }
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  const start = Date.now();
  try {
    const res = await whileBusy(() => getPool().query<T>(text, params));
    const dur = Date.now() - start;
    if (dur > 200) {
      console.warn(`[db][slow] ${dur}ms | ${text.replace(/\s+/g, " ").slice(0, 200)}`);
    }
    return res;
  } catch (err) {
    const dur = Date.now() - start;
    // The pool was holding a connection that had died (the instance slept and the database dropped it).
    // Throw the pool away and try once on a fresh one — nothing ran, so this is safe.
    if (isConnectFailure(err)) {
      resetPool();
      try {
        const res = await whileBusy(() => getPool().query<T>(text, params));
        return res;
      } catch (retryErr) {
        console.error(`[db][err] ${dur}ms | ${text.replace(/\s+/g, " ").slice(0, 200)}`, retryErr);
        throw retryErr;
      }
    }
    console.error(`[db][err] ${dur}ms | ${text.replace(/\s+/g, " ").slice(0, 200)}`, err);
    throw err;
  }
}

/** Opens a client, retrying once on a fresh pool when the connection itself could not be opened. */
async function connectWithRetry(): Promise<PoolClient> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await whileBusy(() => getPool().connect());
    } catch (err) {
      if (attempt > 0 || !isConnectFailure(err)) throw err;
      resetPool();
    }
  }
}

/** Runs `fn` inside a transaction; commits on success, rolls back on any throw. */
export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const start = Date.now();
  const client = await connectWithRetry();
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    const dur = Date.now() - start;
    if (dur > 300) {
      console.warn(`[db][tx][slow] ${dur}ms`);
    }
    return result;
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* connection already gone */
    }
    const dur = Date.now() - start;
    console.error(`[db][tx][err] ${dur}ms`, err);
    throw err;
  } finally {
    client.release();
  }
}
