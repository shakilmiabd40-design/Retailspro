// Run with:  npm run test:webhooks
// The webhook signature is the only thing standing between a public endpoint and a forged "order paid"
// call, so these pin the exact scheme from docs/API.md and prove a receiver's verification accepts the
// real signature and rejects a tampered one. URL validation (SSRF guard) is covered too — it's pure.
import { test } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import { sign, isEventType, validateWebhookUrl, EVENT_TYPES } from "./webhooks";

/** NODE_ENV is typed read-only, but the SSRF guard branches on it, so tests need to flip it. */
const withNodeEnv = (value: string, fn: () => void) => {
  const env = process.env as unknown as { NODE_ENV?: string };
  const prev = env.NODE_ENV;
  env.NODE_ENV = value;
  try {
    fn();
  } finally {
    env.NODE_ENV = prev;
  }
};

test("sign produces the documented sha256=HMAC(timestamp.body)", () => {
  const secret = "whsec_test";
  const ts = "1790244005";
  const body = JSON.stringify({ id: "evt_1", type: "order.created" });
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
  assert.equal(sign(secret, ts, body), expected);
  assert.match(sign(secret, ts, body), /^sha256=[0-9a-f]{64}$/);
});

test("the signature changes with the secret, timestamp or body (tampering is detectable)", () => {
  const body = '{"a":1}';
  const base = sign("s", "1", body);
  assert.notEqual(base, sign("s2", "1", body));
  assert.notEqual(base, sign("s", "2", body));
  assert.notEqual(base, sign("s", "1", '{"a":2}'));
});

test("a receiver's constant-time verification accepts the real signature and rejects a forged one", () => {
  const secret = "whsec_test";
  const ts = "1790244005";
  const body = '{"x":1}';
  const sig = sign(secret, ts, body);
  const verify = (candidate: string) => {
    const expected = "sha256=" + crypto.createHmac("sha256", secret).update(`${ts}.${body}`).digest("hex");
    const a = Buffer.from(candidate);
    const b = Buffer.from(expected);
    return a.length === b.length && crypto.timingSafeEqual(a, b);
  };
  assert.equal(verify(sig), true);
  assert.equal(verify(sign("wrong-secret", ts, body)), false);
  assert.equal(verify("sha256=" + "0".repeat(64)), false);
});

test("isEventType accepts every documented event and rejects anything else", () => {
  for (const t of EVENT_TYPES) assert.equal(isEventType(t), true);
  assert.equal(isEventType("order.deleted"), false);
  assert.equal(isEventType(""), false);
  assert.equal(isEventType(123), false);
});

test("in production validateWebhookUrl requires https and a public address", () => {
  withNodeEnv("production", () => {
    assert.equal(validateWebhookUrl("https://example.com/hook").protocol, "https:");
    assert.throws(() => validateWebhookUrl("http://example.com/hook"), /https/);
    assert.throws(() => validateWebhookUrl("https://127.0.0.1/hook"), /public address/);
    assert.throws(() => validateWebhookUrl("https://10.0.0.5/hook"), /public address/);
    assert.throws(() => validateWebhookUrl("https://192.168.1.1/hook"), /public address/);
    assert.throws(() => validateWebhookUrl("https://user:pass@example.com/hook"), /credentials/);
    assert.throws(() => validateWebhookUrl("not a url"), /valid URL/);
  });
});

test("while developing, http and localhost targets are allowed", () => {
  withNodeEnv("test", () => {
    assert.equal(validateWebhookUrl("http://localhost:3000/hook").protocol, "http:");
    assert.equal(validateWebhookUrl("https://example.com/hook").protocol, "https:");
  });
});
