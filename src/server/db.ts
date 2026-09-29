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

/** "Too many connections" from Postgres (53300 = too_many_connections). Raised while connecting, before any SQL runs, so retrying is always safe. */
export function isDbBusyError(err: unknown): boolean {
  const e = err as { code?: string; message?: string } | null;
  return e?.code === "53300" || /remaining connection slots|too many (clients|connections)/i.test(e?.message ?? "");
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const RETRY_DELAYS_MS = [150, 400, 900];

/** Retries only the "database has no free connection slot right now" failure, with a short jittered back-off. */
async function whileBusy<T>(fn: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (err) {
      if (!isDbBusyError(err) || attempt >= RETRY_DELAYS_MS.length) throw err;
      await sleep(RETRY_DELAYS_MS[attempt] + Math.random() * 150);
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
      // At 2 per instance roughly nine concurrent instances still fit; set DATABASE_POOL_MAX=1 on serverless.
      max: Number(process.env.DATABASE_POOL_MAX ?? 2),
      idleTimeoutMillis: 5_000,
      connectionTimeoutMillis: 15_000,
    });
    globalThis.__inventoryProPool.on("error", (err) => console.error("[db] idle client error", err.message));
  }
  return globalThis.__inventoryProPool;
}

export async function query<T extends QueryResultRow = QueryResultRow>(text: string, params: unknown[] = []) {
  return whileBusy(() => getPool().query<T>(text, params));
}

/** Runs `fn` inside a transaction; commits on success, rolls back on any throw. */
export async function tx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await whileBusy(() => getPool().connect());
  try {
    await client.query("begin");
    const result = await fn(client);
    await client.query("commit");
    return result;
  } catch (err) {
    try {
      await client.query("rollback");
    } catch {
      /* connection already gone */
    }
    throw err;
  } finally {
    client.release();
  }
}
