"use client";

import { useCallback, useEffect, useState, useSyncExternalStore } from "react";
import { Copy, KeyRound, Plus, RefreshCw, RotateCw, Send, Trash2, Webhook as WebhookIcon } from "lucide-react";
import { useAccess } from "@/lib/settings/access";
import { api, HttpError } from "@/lib/persist/api";
import { formatDateTime } from "@/lib/settings/runtime";
import { useToast } from "@/components/toast";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { Field, GhostButton, Modal, PageHeader, PrimaryButton, ReadOnlyBanner, Section, SettingsGate, Tag, TextInput } from "@/components/settings/ui";

interface ApiKey {
  id: string;
  name: string;
  prefix: string;
  scopes: string[];
  status: "active" | "revoked";
  createdAt: string;
  lastUsedAt: string | null;
}
interface Hook {
  id: string;
  name: string;
  url: string;
  secret: string;
  events: string[];
  active: boolean;
  consecutiveFailures: number;
  pending: number;
  failed: number;
  lastDeliveredAt: string | null;
}
interface Delivery {
  id: string;
  webhookId: string;
  event: string;
  status: "pending" | "delivered" | "failed";
  attempts: number;
  lastStatus: number | null;
  lastError: string | null;
  createdAt: string;
}

const SCOPE_LABELS: Record<string, string> = {
  "products:read": "Read products & live stock",
  "orders:read": "Read the orders this key created",
  "orders:write": "Create orders & cancel its own orders",
};
const EVENT_LABELS: Record<string, string> = {
  "order.created": "Order created",
  "order.status_changed": "Order status changed (processing, in transit, delivered…)",
  "order.updated": "Order details changed (tracking id, address…)",
  "stock.updated": "Stock changed (sale, cancel, restock, adjustment)",
  "product.created": "Product added",
  "product.updated": "Product changed (name, price, image, status…)",
  "product.deleted": "Product deleted",
};

function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const showToast = useToast();
  return (
    <GhostButton
      type="button"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          showToast("Copied");
        } catch {
          showToast("Couldn't copy — select it and copy by hand", "error");
        }
      }}
    >
      <Copy size={14} /> {label}
    </GhostButton>
  );
}

function SecretBox({ value }: { value: string }) {
  return (
    <div className="flex items-center gap-2">
      <code className="min-w-0 flex-1 break-all rounded-lg border px-3 py-2 text-[12px]" style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--text)" }}>
        {value}
      </code>
      <CopyButton text={value} />
    </div>
  );
}

function Checks({ options, value, onChange }: { options: [string, string][]; value: string[]; onChange: (v: string[]) => void }) {
  return (
    <div className="space-y-2">
      {options.map(([k, label]) => (
        <label key={k} className="flex cursor-pointer items-start gap-2 text-[13px]" style={{ color: "var(--text)" }}>
          <input type="checkbox" className="mt-0.5" checked={value.includes(k)} onChange={(e) => onChange(e.target.checked ? [...value, k] : value.filter((x) => x !== k))} />
          <span>
            {label} <span className="text-[11.5px]" style={{ color: "var(--text-faint)" }}>{k}</span>
          </span>
        </label>
      ))}
    </div>
  );
}

function Integrations() {
  const { isSuperAdmin } = useAccess();
  const showToast = useToast();
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [hooks, setHooks] = useState<Hook[]>([]);
  const [eventTypes, setEventTypes] = useState<string[]>([]);
  const [deliveries, setDeliveries] = useState<Delivery[]>([]);
  const [loaded, setLoaded] = useState(false);
  const origin = useSyncExternalStore(
    () => () => {},
    () => window.location.origin,
    () => ""
  );

  const [keyModal, setKeyModal] = useState(false);
  const [keyName, setKeyName] = useState("");
  const [keyScopes, setKeyScopes] = useState<string[]>(["products:read", "orders:read", "orders:write"]);
  const [newKey, setNewKey] = useState<string | null>(null);
  const [revoke, setRevoke] = useState<ApiKey | null>(null);

  const [hookModal, setHookModal] = useState(false);
  const [hookName, setHookName] = useState("");
  const [hookUrl, setHookUrl] = useState("");
  const [hookEvents, setHookEvents] = useState<string[]>([]);
  const [shown, setShown] = useState<Record<string, boolean>>({});
  const [removeHook, setRemoveHook] = useState<Hook | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const [k, w, d] = await Promise.all([api<{ keys: ApiKey[] }>("GET", "/api/integrations/keys"), api<{ webhooks: Hook[]; eventTypes: string[] }>("GET", "/api/integrations/webhooks"), api<{ deliveries: Delivery[] }>("GET", "/api/integrations/deliveries")]);
      setKeys(k.keys);
      setHooks(w.webhooks);
      setEventTypes(w.eventTypes);
      setDeliveries(d.deliveries);
    } catch (e) {
      showToast(e instanceof HttpError ? e.message : "Couldn't load integrations", "error");
    } finally {
      setLoaded(true);
    }
  }, [showToast]);

  useEffect(() => {
    // Fetch-on-mount: load() only sets state after the network calls resolve.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isSuperAdmin) void load();
  }, [isSuperAdmin, load]);

  const fail = (e: unknown) => showToast(e instanceof HttpError ? e.message : "Something went wrong", "error");

  async function createKey() {
    setBusy("key");
    try {
      const r = await api<{ key: string }>("POST", "/api/integrations/keys", { name: keyName, scopes: keyScopes });
      setNewKey(r.key);
      setKeyModal(false);
      setKeyName("");
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function createHook() {
    setBusy("hook");
    try {
      await api("POST", "/api/integrations/webhooks", { name: hookName, url: hookUrl, events: hookEvents });
      setHookModal(false);
      setHookName("");
      setHookUrl("");
      setHookEvents([]);
      showToast("Webhook added — send a test event to check it");
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function act(id: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(id);
    try {
      await fn();
      if (done) showToast(done);
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  async function test(h: Hook) {
    setBusy(`test-${h.id}`);
    try {
      const r = await api<{ ok: boolean; status: number | null; error: string | null }>("POST", `/api/integrations/webhooks/${h.id}/test`);
      showToast(r.ok ? `Test event delivered (HTTP ${r.status})` : `Test failed: ${r.error ?? "no response"}`, r.ok ? "success" : "error");
      await load();
    } catch (e) {
      fail(e);
    } finally {
      setBusy(null);
    }
  }

  if (!isSuperAdmin) {
    return (
      <div className="space-y-5">
        <PageHeader title="Integrations & API" description="Connect your online store or other systems." back={{ href: "/settings", label: "Settings" }} />
        <ReadOnlyBanner message="Only a Super Admin can manage API keys and webhooks." />
      </div>
    );
  }

  const hookName_ = (id: string) => hooks.find((h) => h.id === id)?.name || hooks.find((h) => h.id === id)?.url || id;

  return (
    <div className="space-y-5">
      <PageHeader title="Integrations & API" description="Let your online store read products and stock, place orders here, and get notified when things change." back={{ href: "/settings", label: "Settings" }} />

      <Section title="API address" description="Give this address, an API key, and the API documentation to your website developer. Keys must only be used from the website's server, never from code that runs in visitors' browsers.">
        <SecretBox value={origin ? `${origin}/api/v1` : "…"} />
      </Section>

      <Section
        title="API keys"
        description="One key per system. A key can only see and cancel the orders it created itself."
        actions={
          <PrimaryButton onClick={() => setKeyModal(true)}>
            <Plus size={15} /> New key
          </PrimaryButton>
        }
      >
        {!loaded ? (
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Loading…</p>
        ) : keys.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No keys yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[13px]">
              <thead>
                <tr style={{ color: "var(--text-faint)" }} className="text-[11.5px] uppercase">
                  <th className="py-2 pr-4 font-semibold">Name</th>
                  <th className="py-2 pr-4 font-semibold">Key</th>
                  <th className="py-2 pr-4 font-semibold">Can do</th>
                  <th className="py-2 pr-4 font-semibold">Last used</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {keys.map((k) => (
                  <tr key={k.id} className="border-t" style={{ borderColor: "var(--border-soft)", opacity: k.status === "revoked" ? 0.55 : 1 }}>
                    <td className="py-2.5 pr-4 font-medium" style={{ color: "var(--text)" }}>
                      <span className="flex items-center gap-2">
                        <KeyRound size={14} style={{ color: "var(--text-faint)" }} /> {k.name} {k.status === "revoked" && <Tag tone="red">Revoked</Tag>}
                      </span>
                    </td>
                    <td className="py-2.5 pr-4 font-mono text-[12px]" style={{ color: "var(--text-muted)" }}>{k.prefix}…</td>
                    <td className="py-2.5 pr-4">
                      <span className="flex flex-wrap gap-1">{k.scopes.map((s) => <Tag key={s}>{s}</Tag>)}</span>
                    </td>
                    <td className="py-2.5 pr-4" style={{ color: "var(--text-muted)" }}>{k.lastUsedAt ? formatDateTime(k.lastUsedAt) : "Never"}</td>
                    <td className="py-2.5 text-right">
                      {k.status === "active" && (
                        <GhostButton danger onClick={() => setRevoke(k)}>
                          Revoke
                        </GhostButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section
        title="Webhooks"
        description="RetailPro sends a signed message to these addresses when something changes (an order moves to In Transit, stock changes…). Failed messages are retried for about a day."
        actions={
          <PrimaryButton onClick={() => setHookModal(true)}>
            <Plus size={15} /> Add webhook
          </PrimaryButton>
        }
      >
        {!loaded ? null : hooks.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>No webhooks yet. Ask your developer for the URL that should receive events.</p>
        ) : (
          <div className="space-y-3">
            {hooks.map((h) => (
              <div key={h.id} className="rounded-xl border p-4" style={{ borderColor: "var(--border-soft)", background: "var(--surface-2)" }}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="flex flex-wrap items-center gap-2 text-[13.5px] font-semibold" style={{ color: "var(--text)" }}>
                      <WebhookIcon size={15} /> {h.name || "Webhook"}
                      <Tag tone={h.active ? "green" : "muted"}>{h.active ? "Active" : "Paused"}</Tag>
                      {h.failed > 0 && <Tag tone="red">{h.failed} failed</Tag>}
                      {h.pending > 0 && <Tag tone="blue">{h.pending} waiting</Tag>}
                    </p>
                    <p className="mt-1 break-all text-[12.5px]" style={{ color: "var(--text-muted)" }}>{h.url}</p>
                    <p className="mt-2 flex flex-wrap gap-1">{(h.events.includes("*") ? ["All events"] : h.events).map((e) => <Tag key={e}>{e}</Tag>)}</p>
                    <p className="mt-2 text-[12px]" style={{ color: "var(--text-faint)" }}>Last delivered: {h.lastDeliveredAt ? formatDateTime(h.lastDeliveredAt) : "never"}</p>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <GhostButton disabled={busy === `test-${h.id}`} onClick={() => test(h)}>
                      <Send size={14} /> {busy === `test-${h.id}` ? "Sending…" : "Send test"}
                    </GhostButton>
                    <GhostButton onClick={() => act(h.id, () => api("PATCH", `/api/integrations/webhooks/${h.id}`, { active: !h.active }), h.active ? "Paused" : "Resumed")}>{h.active ? "Pause" : "Resume"}</GhostButton>
                    <GhostButton danger onClick={() => setRemoveHook(h)}>
                      <Trash2 size={14} />
                    </GhostButton>
                  </div>
                </div>
                <div className="mt-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-[12px] font-medium" style={{ color: "var(--text-muted)" }}>Signing secret</span>
                    <GhostButton type="button" onClick={() => setShown((s) => ({ ...s, [h.id]: !s[h.id] }))}>{shown[h.id] ? "Hide" : "Show"}</GhostButton>
                    <GhostButton type="button" onClick={() => act(h.id, () => api("PATCH", `/api/integrations/webhooks/${h.id}`, { rotateSecret: true }), "New secret created — give it to your developer")}>
                      <RotateCw size={14} /> Rotate
                    </GhostButton>
                  </div>
                  {shown[h.id] && <SecretBox value={h.secret} />}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      <Section
        title="Recent deliveries"
        description="The last 40 webhook messages."
        actions={
          <GhostButton onClick={() => void load()}>
            <RefreshCw size={14} /> Refresh
          </GhostButton>
        }
      >
        {deliveries.length === 0 ? (
          <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>Nothing sent yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-[12.5px]">
              <thead>
                <tr style={{ color: "var(--text-faint)" }} className="text-[11.5px] uppercase">
                  <th className="py-2 pr-4 font-semibold">When</th>
                  <th className="py-2 pr-4 font-semibold">Event</th>
                  <th className="py-2 pr-4 font-semibold">To</th>
                  <th className="py-2 pr-4 font-semibold">Result</th>
                  <th className="py-2" />
                </tr>
              </thead>
              <tbody>
                {deliveries.map((d) => (
                  <tr key={d.id} className="border-t" style={{ borderColor: "var(--border-soft)" }}>
                    <td className="py-2 pr-4" style={{ color: "var(--text-muted)" }}>{formatDateTime(d.createdAt)}</td>
                    <td className="py-2 pr-4 font-mono" style={{ color: "var(--text)" }}>{d.event}</td>
                    <td className="max-w-[220px] truncate py-2 pr-4" style={{ color: "var(--text-muted)" }}>{hookName_(d.webhookId)}</td>
                    <td className="py-2 pr-4">
                      <Tag tone={d.status === "delivered" ? "green" : d.status === "failed" ? "red" : "blue"}>{d.status === "pending" && d.attempts > 0 ? `retrying (try ${d.attempts})` : d.status}</Tag>
                      {d.lastError && d.status !== "delivered" && <span className="ml-2" style={{ color: "var(--text-faint)" }}>{d.lastError}</span>}
                    </td>
                    <td className="py-2 text-right">
                      {d.status === "failed" && (
                        <GhostButton onClick={() => act(d.id, () => api("POST", `/api/integrations/deliveries/${d.id}/retry`), "Queued for retry")}>Retry</GhostButton>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Modal
        open={keyModal}
        title="New API key"
        onClose={() => setKeyModal(false)}
        footer={
          <>
            <GhostButton onClick={() => setKeyModal(false)}>Cancel</GhostButton>
            <PrimaryButton disabled={busy === "key" || keyName.trim().length < 2 || !keyScopes.length} onClick={createKey}>
              Create key
            </PrimaryButton>
          </>
        }
      >
        <Field label="Name" hint="Shown on every order this key creates, e.g. “Sabsan website”. Must be unique." required>
          <TextInput value={keyName} onChange={(e) => setKeyName(e.target.value)} placeholder="Sabsan website" maxLength={60} />
        </Field>
        <Field label="Permissions">
          <Checks options={Object.entries(SCOPE_LABELS)} value={keyScopes} onChange={setKeyScopes} />
        </Field>
      </Modal>

      <Modal open={!!newKey} title="Copy your API key now" onClose={() => setNewKey(null)} footer={<PrimaryButton onClick={() => setNewKey(null)}>I&apos;ve saved it</PrimaryButton>}>
        <p className="text-[13px]" style={{ color: "var(--text-muted)" }}>
          This is the only time the full key is shown. Send it to your developer over a private channel (not email or a public chat) and have them store it as a server-side secret. If it is lost, revoke it and create a new one.
        </p>
        {newKey && <SecretBox value={newKey} />}
      </Modal>

      <Modal
        open={hookModal}
        title="Add webhook"
        onClose={() => setHookModal(false)}
        wide
        footer={
          <>
            <GhostButton onClick={() => setHookModal(false)}>Cancel</GhostButton>
            <PrimaryButton disabled={busy === "hook" || !hookUrl.trim() || !hookEvents.length} onClick={createHook}>
              Add webhook
            </PrimaryButton>
          </>
        }
      >
        <Field label="Name" hint="Optional, just for you.">
          <TextInput value={hookName} onChange={(e) => setHookName(e.target.value)} placeholder="Sabsan website" maxLength={80} />
        </Field>
        <Field label="Endpoint URL" hint="Must be https:// and reachable from the internet. Your developer gives you this." required>
          <TextInput value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} placeholder="https://sabsantrend.com/api/retailpro-webhook" />
        </Field>
        <Field label="Send me…">
          <div className="mb-2">
            <GhostButton type="button" onClick={() => setHookEvents(hookEvents.length === eventTypes.length ? [] : [...eventTypes])}>
              {hookEvents.length === eventTypes.length ? "Clear all" : "Select all"}
            </GhostButton>
          </div>
          <Checks options={eventTypes.map((e) => [e, EVENT_LABELS[e] ?? e])} value={hookEvents} onChange={setHookEvents} />
        </Field>
      </Modal>

      <ConfirmDialog
        open={!!revoke}
        title="Revoke this key?"
        message={`“${revoke?.name}” stops working immediately. The website will no longer be able to read stock or place orders until you give it a new key.`}
        confirmLabel="Revoke"
        onCancel={() => setRevoke(null)}
        onConfirm={() => {
          const k = revoke!;
          setRevoke(null);
          void act(k.id, () => api("DELETE", `/api/integrations/keys/${k.id}`), "Key revoked");
        }}
      />
      <ConfirmDialog
        open={!!removeHook}
        title="Delete this webhook?"
        message="No more events will be sent to this address, and its delivery history is removed."
        confirmLabel="Delete"
        onCancel={() => setRemoveHook(null)}
        onConfirm={() => {
          const h = removeHook!;
          setRemoveHook(null);
          void act(h.id, () => api("DELETE", `/api/integrations/webhooks/${h.id}`), "Webhook deleted");
        }}
      />
    </div>
  );
}

export default function IntegrationsPage() {
  return (
    <SettingsGate>
      <Integrations />
    </SettingsGate>
  );
}
