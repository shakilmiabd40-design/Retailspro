# RetailPro Public API & Webhooks — Developer Documentation

**Version:** `2026-09-01` · **Audience:** the developer of the online store (e.g. sabsantrend.com)

RetailPro is the shop's back office: products, live stock, orders, courier dispatch and delivery. This API lets the website:

| Direction | What | How |
| --- | --- | --- |
| Website → RetailPro | Read products, prices and **live stock** | `GET /products` |
| Website → RetailPro | **Place an order** when a customer checks out (stock is reserved automatically) | `POST /orders` |
| Website → RetailPro | Look up / cancel its own orders | `GET /orders/{id}`, `POST /orders/{id}/cancel` |
| RetailPro → Website | Get told when an order's status changes (processing, in transit + tracking id, delivered, cancelled…) | **Webhooks** |
| RetailPro → Website | Get told when stock, price or product details change | **Webhooks** |

```
 Customer ──► Website ──(1) POST /orders ───────────────► RetailPro
                 ▲                                            │ staff process, dispatch, deliver
                 └────────(2) webhook: order.status_changed ◄─┘
                 └────────(3) webhook: stock.updated / product.updated
```

> **Base URL:** `https://YOUR-RETAILPRO-DOMAIN/api/v1` (the shop owner gives you the exact address — it is also shown in RetailPro under *Settings → Integrations & API*).
> All requests and responses are JSON (UTF-8). All money is in **BDT (৳)**, as plain numbers (`8900` or `8900.5`).

---

## 1. Authentication

The shop owner creates an **API key** for you (*Settings → Integrations & API → New key*). It looks like `rp_live_xxxxxxxx…` and is shown once.

Send it on every request:

```http
Authorization: Bearer rp_live_xxxxxxxxxxxxxxxxxxxxxxxx
```

(`X-API-Key: <key>` is accepted too.)

**Security rules — please read**

1. **Call the API only from your server** (backend, serverless/edge function). Never put the key in browser JavaScript, a mobile app bundle, or a public repo — anyone who has it can place orders in the shop's name. Your storefront's browser code should call *your* backend, which calls RetailPro.
2. Keep the key in a server-side secret / environment variable.
3. A key has **permissions (scopes)**: `products:read`, `orders:read`, `orders:write`. Calling something outside the key's scopes returns `403 insufficient_scope`.
4. A key can only **see and cancel the orders it created itself** (orders are tagged with the key's name as their `channel`). It cannot see walk-in POS sales or orders created by staff.
5. If a key leaks, the owner revokes it in one click and issues a new one.

**Rate limit:** 120 requests per minute per key. Beyond that you get `429 rate_limited` with a `Retry-After` header (seconds).

### Check your key

```bash
curl https://YOUR-RETAILPRO-DOMAIN/api/v1/ping -H "Authorization: Bearer $RETAILPRO_KEY"
```
```json
{ "data": { "status": "ok", "key_name": "Sabsan website", "scopes": ["products:read","orders:read","orders:write"], "server_time": "2026-09-24T10:00:00.000Z" } }
```

---

## 2. Conventions

**Errors** always look like this, with a matching HTTP status:

```json
{ "error": { "code": "insufficient_stock", "message": "Not enough stock for one or more items.", "details": { "items": [ ... ] } } }
```

| HTTP | `error.code` | Meaning / what to do |
| --- | --- | --- |
| 400 | `invalid_json`, `invalid_cursor`, `invalid_parameter` | Malformed request. Fix it; don't retry unchanged. |
| 401 | `missing_api_key`, `invalid_api_key` | No key / wrong / revoked key. |
| 403 | `insufficient_scope` | Key lacks the permission (`details.required_scope`). |
| 404 | `not_found` | Unknown product/order (or an order that isn't yours). |
| 409 | `insufficient_stock` | Not enough stock; `details.items[]` lists each short SKU with `requested` and `available`. Show the customer, refresh stock. |
| 409 | `cannot_cancel` | The order already reached the courier. |
| 422 | `invalid_field`, `invalid_phone`, `unknown_sku`, `ambiguous_sku`, `unknown_product`, `unknown_variant`, `product_unavailable` | Validation problem; `details.field` says which one. |
| 429 | `rate_limited` | Slow down; wait `Retry-After` seconds. |
| 5xx | `server_error`, `service_unavailable` | Temporary. **Retry with the same `external_id`** (see §4.1) — it is safe. |

**Pagination** (list endpoints): `?limit=1..100` (default 25) and `?cursor=…`. The response has `has_more` and `next_cursor`; pass `next_cursor` as `cursor` to get the next page.

```json
{ "data": [ ... ], "has_more": true, "next_cursor": "MTIzNA" }
```

**Timestamps** are ISO-8601 UTC (`2026-09-24T10:00:00.000Z`). `updated_since` filters accept the same format.

**Every response** carries `X-Request-Id` — quote it when reporting a problem.

---

## 3. Products & stock

### `GET /products`  — scope `products:read`

Query parameters (all optional): `status=active|inactive|all` (default `active`), `q` (name / SKU search), `category`, `brand`, `updated_since`, `limit`, `cursor`.

```bash
curl "https://YOUR-RETAILPRO-DOMAIN/api/v1/products?limit=50" -H "Authorization: Bearer $RETAILPRO_KEY"
```
```json
{
  "data": [
    {
      "id": "p-adidas-ultraboost",
      "sku": "AD-UB22",
      "barcode": null,
      "name": "Adidas Ultraboost 22",
      "brand": "Adidas",
      "category": "Running",
      "description": null,
      "status": "active",
      "image_url": "https://…/ultraboost.jpg",
      "gender": "Men",
      "shoe_type": "Running",
      "material": "Primeknit",
      "currency": "BDT",
      "selling_price": 8900,
      "discount_price": null,
      "colors": ["Black"],
      "sizes": ["36", "37"],
      "variants": [
        { "id": "48a8cc60-…", "sku": "AD-UB22-BLA-36", "barcode": null, "color": "Black", "size": "36",
          "price": 8900, "status": "active", "stock": 2, "reserved": 0, "available": 2 }
      ],
      "total_available": 2,
      "created_at": "2026-09-01T08:00:00.000Z"
    }
  ],
  "has_more": false,
  "next_cursor": null
}
```

**Stock fields** (per variant = one colour × size):
* `stock` — units physically on the shelf.
* `reserved` — units promised to orders that are not yet delivered/cancelled.
* **`available` = `stock − reserved`** — *this is the number to show and to sell against.*

Only variants with `status: "active"` are sellable. Cost prices and supplier data are never exposed.

### `GET /products/{id}`  — scope `products:read`

`{id}` may be the product `id`, the product `sku`, or any variant `sku`. Returns `{ "data": { …same as above… } }`.

---

## 4. Orders

RetailPro orders are **cash on delivery (COD)**: the courier collects `amounts.expected_cod` from the customer. (If the website also accepts online payment, put a note such as "Paid online, bKash TrxID …" in `notes` and send the amount still to be collected via `unit_price`/`discount`/`delivery_charge` so `expected_cod` is correct; ask the shop owner how they want prepaid orders handled.)

### 4.1 `POST /orders` — place an order — scope `orders:write`

```bash
curl -X POST https://YOUR-RETAILPRO-DOMAIN/api/v1/orders \
  -H "Authorization: Bearer $RETAILPRO_KEY" -H "Content-Type: application/json" \
  -d '{
    "external_id": "W-1001",
    "customer": {
      "name": "Rahim Uddin",
      "phone": "01712345678",
      "alt_phone": "01812345678",
      "address": "House 5, Road 3, Sector 7, Uttara, Dhaka",
      "district": "Dhaka",
      "area": "Uttara"
    },
    "items": [
      { "sku": "AD-UB22-BLA-36", "qty": 2, "discount": 100 }
    ],
    "delivery_charge": 60,
    "notes": "Call before delivery"
  }'
```

| Field | Required | Notes |
| --- | --- | --- |
| `external_id` | **yes** | **Your own order id**, ≤100 chars, unique per API key. See idempotency below. |
| `customer.name` | yes | 2+ characters. |
| `customer.phone` | yes | Bangladeshi mobile: `01XXXXXXXXX`, `8801XXXXXXXXX` or `+8801XXXXXXXXX`. Stored as `01XXXXXXXXX`. Other formats → `422 invalid_phone`. |
| `customer.alt_phone` | no | Same format. |
| `customer.address` | yes | Full delivery address (8+ chars). |
| `customer.district`, `customer.area` | no | If omitted, RetailPro tries to detect them from the address. |
| `items[]` | yes | 1–50 lines. Each line needs **`sku`** (the *variant* SKU, exact match) **or** both `product_id` + `variant_id`. |
| `items[].qty` | yes | Whole number 1–100. |
| `items[].unit_price` | no | Defaults to RetailPro's current variant price. Send it only if the website deliberately charges a different price (sales, coupons) so the courier collects the right amount. |
| `items[].discount` | no | Taka knocked off this *line* (not per unit). Default 0. |
| `delivery_charge` | no | Taka the customer pays for delivery (default 0). **Your site decides it.** |
| `notes` | no | ≤1000 chars, visible to staff. |

**What happens:** the order is created with status `pending` and gets a number like `ORD-10245`; the requested units are **reserved** so nobody else (website or shop staff) can sell them. Staff then process and dispatch it in the dashboard, and you hear about every step through webhooks.

**Response `201 Created`:**

```json
{
  "data": {
    "id": "29eb0e38-a4f2-4181-911b-6ed132d47a7b",
    "order_number": "ORD-10245",
    "external_id": "W-1001",
    "channel": "Sabsan website",
    "status": "pending",
    "customer": { "name": "Rahim Uddin", "phone": "01712345678", "alt_phone": "01812345678",
                  "address": "House 5, Road 3, Sector 7, Uttara, Dhaka", "district": "Dhaka", "area": "Uttara" },
    "notes": "Call before delivery",
    "items": [
      { "product_id": "p-adidas-ultraboost", "variant_id": "48a8cc60-…", "sku": "AD-UB22-BLA-36",
        "name": "Adidas Ultraboost 22", "color": "Black", "size": "36",
        "unit_price": 8900, "qty": 2, "discount": 100, "line_total": 17700 }
    ],
    "currency": "BDT",
    "amounts": { "subtotal": 17800, "discount_total": 100, "delivery_charge": 60, "expected_cod": 17760 },
    "courier": { "company": null, "tracking_id": null, "dispatch_date": null },
    "delivery": { "collected_amount": null, "delivery_date": null },
    "cancellation": null,
    "timeline": [ { "at": "2026-09-24T10:00:05.673Z", "label": "Order Created", "detail": "Placed via Sabsan website (W-1001)" } ],
    "created_at": "2026-09-24T10:00:05.673Z",
    "updated_at": "2026-09-24T10:00:05.673Z"
  },
  "duplicate": false
}
```

**Idempotency (important).** Networks fail. If your request times out, or you get a 5xx, **just send the same request again with the same `external_id`.** RetailPro never creates a second order for an `external_id` it has already accepted: it returns `200 OK` with the original order, `"duplicate": true` and the header `Idempotent-Replayed: true`. Two simultaneous requests with the same id also produce exactly one order. Use your website's own order id (or a UUID you store with the cart) — do not generate a fresh one on retry.

**Stock is checked atomically.** If two customers buy the last pair at the same instant, one gets `201`, the other `409 insufficient_stock` (with `details.items[].available`). Handle it in checkout: tell the customer, update the cart.

### 4.2 `GET /orders/{id}` — scope `orders:read`

`{id}` may be RetailPro's `id`, the `order_number` (`ORD-10245`) or **your `external_id`**. Returns the same object as above. Use it to render "Track my order".

### 4.3 `GET /orders` — scope `orders:read`

Lists the orders **this key created**, newest first. Filters: `status`, `external_id`, `phone`, `updated_since`, `limit`, `cursor`.

### 4.4 `POST /orders/{id}/cancel` — scope `orders:write`

```bash
curl -X POST https://YOUR-RETAILPRO-DOMAIN/api/v1/orders/W-1001/cancel \
  -H "Authorization: Bearer $RETAILPRO_KEY" -H "Content-Type: application/json" \
  -d '{ "reason": "Customer changed mind", "notes": "optional" }'
```

Allowed only while the order is `pending` or `processing` (before the parcel reaches the courier). It releases the reserved stock. Cancelling an already-cancelled order returns it unchanged (`200`). Otherwise `409 cannot_cancel` — tell the customer to contact the shop.

### 4.5 Order statuses

| `status` | Meaning | Suggested customer-facing text |
| --- | --- | --- |
| `pending` | Received, waiting for staff | Order received |
| `processing` | Being packed | Preparing your order |
| `in_transit` | Handed to the courier — `courier.company` and `courier.tracking_id` are now set | On the way |
| `delivered` | Delivered and paid; `delivery.collected_amount`, `delivery.delivery_date` | Delivered |
| `partial_delivered` | Customer kept some items; the rest returns to the shop | Partly delivered |
| `refuse_return` | Customer refused; parcel returning | Delivery failed — returning |
| `cancelled` | Cancelled (`cancellation.reason`) | Cancelled |

Normal path: `pending → processing → in_transit → delivered | partial_delivered | refuse_return`. `cancelled` branches off `pending`/`processing` only. Final states: `delivered`, `partial_delivered`, `refuse_return`, `cancelled`.

---

## 5. Webhooks (RetailPro → your website)

The shop owner registers **your endpoint URL** in *Settings → Integrations & API → Add webhook* and chooses the events. You then receive an HTTPS `POST` for each event. Your URL must be public HTTPS.

### 5.1 Events

| `type` | When | `data` contains |
| --- | --- | --- |
| `order.created` | Any new order (including the ones you place) | `order` |
| `order.status_changed` | Status moved (e.g. `processing → in_transit`) | `previous_status`, `changed_fields`, `order` |
| `order.updated` | Other changes: tracking id, address, items… | `changed_fields`, `order` |
| `stock.updated` | Stock or reservation of a product's variants changed (sale, cancel, restock, correction) | `product_id`, `product_sku`, `product_name`, `total_available`, `variants[]` (only the variants that changed: `id, sku, color, size, stock, reserved, available`) |
| `product.created` | Product added | `product` |
| `product.updated` | Name, price, image, description, status, variants added/removed… (not stock) | `changed_fields`, `product` |
| `product.deleted` | Product deleted | `product_id`, `sku`, `name` |
| `ping` | The "Send test" button | `message` |

`order` and `product` objects have exactly the same shape as in the REST API.
Orders/products created or changed by *staff in the dashboard* also fire events — that's how the website learns about everything.

### 5.2 Request format

```http
POST /your/endpoint HTTP/1.1
Content-Type: application/json
User-Agent: RetailPro-Webhooks/1.0
X-RetailPro-Event: order.status_changed
X-RetailPro-Delivery: evt_5f1c0e9a7d3b4a2c8e6f1a90
X-RetailPro-Timestamp: 1790244005
X-RetailPro-Signature: sha256=3c1f…e9

{
  "id": "evt_5f1c0e9a7d3b4a2c8e6f1a90",
  "type": "order.status_changed",
  "api_version": "2026-09-01",
  "created_at": "2026-09-24T10:00:05.000Z",
  "data": {
    "previous_status": "processing",
    "changed_fields": ["status", "courier"],
    "order": { "order_number": "ORD-10245", "external_id": "W-1001", "status": "in_transit",
               "courier": { "company": "Pathao", "tracking_id": "PT123456", "dispatch_date": "2026-09-24" }, "…": "…" }
  }
}
```

### 5.3 Verify the signature (do this!)

Anyone can `POST` to a public URL, so verify every request. RetailPro signs `"<timestamp>.<raw request body>"` with HMAC-SHA256 using the webhook's **signing secret** (`whsec_…`, shown in RetailPro next to the webhook; the owner gives it to you). Compare in constant time, use the **raw** body (not re-serialised JSON), and reject timestamps older than 5 minutes (replay protection).

**Node.js / TypeScript (Express-style)**

```ts
import crypto from "node:crypto";

// IMPORTANT: capture the raw body, e.g. express.raw({ type: "application/json" })
export function verifyRetailProWebhook(rawBody: string, headers: Record<string, string | undefined>, secret: string): boolean {
  const ts = headers["x-retailpro-timestamp"];
  const sig = headers["x-retailpro-signature"];
  if (!ts || !sig) return false;
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false; // older than 5 minutes
  const expected = "sha256=" + crypto.createHmac("sha256", secret).update(`${ts}.${rawBody}`).digest("hex");
  const a = Buffer.from(sig), b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}
```

**Deno / Supabase Edge Function / Cloudflare Workers (Web Crypto)**

```ts
async function verify(rawBody: string, req: Request, secret: string) {
  const ts = req.headers.get("x-retailpro-timestamp") ?? "";
  const sig = req.headers.get("x-retailpro-signature") ?? "";
  if (Math.abs(Date.now() / 1000 - Number(ts)) > 300) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const mac = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${ts}.${rawBody}`));
  const expected = "sha256=" + [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, "0")).join("");
  return expected.length === sig.length && expected === sig; // fine for a webhook; use a constant-time compare if your runtime has one
}

Deno.serve(async (req) => {
  const raw = await req.text();
  if (!(await verify(raw, req, Deno.env.get("RETAILPRO_WEBHOOK_SECRET")!))) return new Response("bad signature", { status: 401 });
  const event = JSON.parse(raw);
  // …handle event (see §5.5)…
  return new Response("ok");
});
```

**PHP**

```php
$raw = file_get_contents('php://input');
$ts  = $_SERVER['HTTP_X_RETAILPRO_TIMESTAMP'] ?? '';
$sig = $_SERVER['HTTP_X_RETAILPRO_SIGNATURE'] ?? '';
$expected = 'sha256=' . hash_hmac('sha256', $ts . '.' . $raw, getenv('RETAILPRO_WEBHOOK_SECRET'));
if (abs(time() - (int)$ts) > 300 || !hash_equals($expected, $sig)) { http_response_code(401); exit; }
$event = json_decode($raw, true);
```

**Python**

```python
import hmac, hashlib, time
def verify(raw: bytes, ts: str, sig: str, secret: str) -> bool:
    if abs(time.time() - int(ts)) > 300: return False
    expected = "sha256=" + hmac.new(secret.encode(), ts.encode() + b"." + raw, hashlib.sha256).hexdigest()
    return hmac.compare_digest(expected, sig)
```

### 5.4 Delivery guarantees

* **Respond with any `2xx` within 8 seconds** to acknowledge. Do the heavy work *after* responding (queue it).
* Anything else (non-2xx, timeout, connection error) is **retried** after 1 min, 5 min, 30 min, 2 h, 6 h, 12 h; then marked *failed* (the owner can re-send it from the dashboard). Redirects are **not** followed — register the final URL.
* Delivery is **at-least-once** → the same event can arrive twice. De-duplicate on `id` (`X-RetailPro-Delivery`) or, better, make your handler **idempotent**: "set order W-1001 to `in_transit` with tracking PT123456" is safe to run twice.
* **Ordering is best-effort.** Events for one webhook are sent in the order they happened, but retries can reorder them. Never assume the last-received event is the latest state: for orders compare `order.updated_at` and ignore an event older than what you already store; for products/stock, when in doubt just call `GET /products/{id}` (or `GET /orders/{id}`) to read the current state.
* A change made in RetailPro is committed together with its event, so a saved change is never lost; the event just may arrive late if your endpoint was down.

### 5.5 What the website should do per event

| Event | Suggested handling |
| --- | --- |
| `order.status_changed` / `order.updated` | Find the order by `order.external_id`; update its status, `courier.company`, `courier.tracking_id`; email/SMS the customer ("On the way — tracking PT123456"). |
| `order.created` | Optional. Orders you placed come back too (`external_id` is yours) — ignore ones you already know. Orders with an unknown `external_id` were made by staff; ignore them unless you want them in the site's history. |
| `stock.updated` | For each entry in `variants[]` set the website's stock for that SKU to `available`. Hide "Add to cart"/show "Sold out" when 0. |
| `product.created` / `product.updated` / `product.deleted` | Create/update/unpublish the product in the website catalogue (name, price, image, variants). |

---

## 6. Recommended integration plan

1. **Initial catalogue import** — page through `GET /products?limit=100` (follow `next_cursor`) and store products with their variant SKUs. Map by **variant SKU** (stable) or `product.id`.
2. **Keep it fresh** — handle `product.*` / `stock.updated` webhooks. As a safety net run a reconciliation every 10–15 min: `GET /products?updated_since=<last run>`; and do a full resync nightly.
3. **Checkout** — before payment/confirmation call `GET /products/{sku}` (or trust your webhook-fed stock) and disable unavailable variants; on submit call `POST /orders` with `external_id` = your order id. Save RetailPro's `order_number` in your order. On `409 insufficient_stock` show a friendly message; on 5xx/timeout retry with the same `external_id` (up to a few times with back-off) and never show "failed" until you know.
4. **Order tracking page** — read your own stored status (kept up to date by `order.status_changed`), and fall back to `GET /orders/{external_id}`.
5. **Customer cancellation** — `POST /orders/{id}/cancel`; on `409 cannot_cancel` tell the customer the parcel is already with the courier.
6. **Monitoring** — log `X-Request-Id`, alert on repeated 5xx/401.

**Minimal server-side client (TypeScript, Node 18+/Deno/edge):**

```ts
const BASE = process.env.RETAILPRO_URL!;      // https://YOUR-RETAILPRO-DOMAIN/api/v1
const KEY  = process.env.RETAILPRO_KEY!;      // server-side secret

async function rp<T>(path: string, init: RequestInit = {}, retries = 3): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(BASE + path, {
      ...init,
      headers: { Authorization: `Bearer ${KEY}`, "Content-Type": "application/json", ...init.headers },
    });
    if (res.ok) return res.json();
    const body = await res.json().catch(() => ({}));
    if ((res.status >= 500 || res.status === 429) && attempt < retries) {
      await new Promise((r) => setTimeout(r, 500 * 2 ** attempt));   // safe: POST /orders is idempotent by external_id
      continue;
    }
    throw Object.assign(new Error(body?.error?.message ?? `HTTP ${res.status}`), { status: res.status, code: body?.error?.code, details: body?.error?.details });
  }
}

export const placeOrder = (o: unknown) => rp<{ data: any; duplicate: boolean }>("/orders", { method: "POST", body: JSON.stringify(o) });
export const getProduct = (sku: string) => rp<{ data: any }>(`/products/${encodeURIComponent(sku)}`);
export const cancelOrder = (ref: string, reason: string) => rp<{ data: any }>(`/orders/${encodeURIComponent(ref)}/cancel`, { method: "POST", body: JSON.stringify({ reason }) });
```

---

## 7. Go-live checklist

- [ ] `GET /ping` works with the production key, from the production server.
- [ ] The key is stored server-side only; not in the front-end bundle or repository.
- [ ] Webhook endpoint is public HTTPS, verifies the signature, answers `2xx` quickly.
- [ ] *Send test* in RetailPro shows **delivered**.
- [ ] Place a test order → it appears in RetailPro with status Pending, stock reserved.
- [ ] Re-send the same `external_id` → no second order (`duplicate: true`).
- [ ] Try to order more than available → `409 insufficient_stock` handled nicely.
- [ ] In RetailPro move the test order to Processing → In Transit (with tracking) → Delivered; website status follows each step.
- [ ] Cancel a pending test order from the website → stock is released.

## 8. Changelog

* **2026-09-01** — first release: products, orders, cancel, webhooks (`order.*`, `stock.updated`, `product.*`).
