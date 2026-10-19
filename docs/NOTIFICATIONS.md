# Inventory notifications: developer guide

How stock alerts work in Inventory Pro, where the code lives, and how to extend it.

## Where things live

| Path | Role |
| --- | --- |
| `src/lib/notifications/types.ts` | Shared contract: statuses, severities, notification and settings types |
| `src/lib/notifications/engine.ts` | Pure logic: status evaluation, hysteresis, transitions, payload builder, escalation |
| `src/lib/notifications/store.tsx` | React provider: persistence, sync on inventory change, acknowledge / assign / resolve |
| `src/components/notifications/` | Status/severity badges and the top-bar bell |
| `src/app/notifications/` | Alerts feed + stock board, detail page, thresholds & routing page |

The engine has no React or storage dependencies, so it can move to a server unchanged.

## Statuses

| Status | Severity | Set when |
| --- | --- | --- |
| On Target | none | Available units are above the monitor band. No notification. |
| Monitor | info | Available ≤ reorder point × monitor multiplier |
| Replenish | warning | Available ≤ reorder point |
| Critical | critical | Available ≤ emergency threshold |
| Out of Stock | critical | Available = 0 |
| Hold / Blocked | warning | Product or variant is inactive but units are still on hand |
| In Progress | info | Item is Replenish/Critical/Out of Stock **and** an approved, sent or partially received purchase order still has units to arrive |
| Complete | info | Item recovered to On Target from Replenish, Critical, Out of Stock, In Progress or Hold |

"Available" means `stock − reserved`. Inactive items with zero stock are ignored (discontinued).
Draft purchase orders don't change status; they appear as linked purchase orders on the detail page.

Defaults: reorder point 5, emergency threshold 2, monitor multiplier 2 (Monitor ≤ 10, which matches the "low stock" badge on the products page). Change them at **Notifications → Thresholds & routing**.

## Transitions

Detected by `syncNotifications()` on every change to products, purchase orders or settings.

- Getting worse is immediate. Getting better needs headroom (`hysteresisPct`, default 10%, at least 1 unit) over the level being left, so one sale or return at a boundary can't flip the status.
- Any change of status closes the item's open notifications as *superseded* and opens a new one.
- Reaching On Target closes them as *stock recovered* (or *hold released*) and raises **Complete** when the previous status was an actionable one.
- Monitor → On Target is silent.
- First evaluation of an item only notifies for Replenish, Critical, Out of Stock and Hold, so existing catalogues don't flood the feed with Monitor noise.
- Every transition is stored in `history` (`from`, `to`, `quantityOnHand`, `timestamp`, `actor`).

## Payload

`toPayload(notification)` returns the wire format. Example:

```json
{
  "notification_id": "notif_ecb913e6",
  "status": "Replenish",
  "severity": "warning",
  "item_id": "p-nike-am270",
  "sku": "NK-AM270-BLA-40",
  "location_id": "main",
  "quantity_on_hand": 3,
  "threshold_type": "reorder_point",
  "threshold_value": 5,
  "timestamp": "2026-09-20T10:02:00.000Z",
  "source": "inventory_engine",
  "suggested_action": "Create purchase order for 17 units of Nike Air Max 270 (Black/40).",
  "workflow_id": null,
  "owner_role": "purchasing",
  "assignee": null,
  "escalation_rule": { "if_unacknowledged_minutes": 120, "notify": ["procurement_lead"] },
  "related_documents": ["PO-3001"],
  "make": "Nike",
  "specification": "Black / 40, Running, Mesh / Synthetic",
  "channels": ["in_app", "email"],
  "state": "open"
}
```

Notes:
- `quantity_on_hand` is the **available** quantity (stock minus reserved). The detail page also shows physical stock and reserved.
- `threshold_type` is one of `reorder_point`, `emergency_threshold`, `monitor_band`, `zero_stock`, or `null` for Hold / In Progress / Complete.
- `sku` is the variant SKU; `item_id` is the product id.
- `source` is `inventory_engine`, `catalog` (hold), `purchasing` (in progress) or `receiving` (complete).
- The detail page has a **Copy JSON** button for any notification.

## Routing and escalation

| Status | Owner | Channels |
| --- | --- | --- |
| Monitor, Replenish, Hold | Purchasing / Purchasing / Warehouse | In-app + email |
| Critical | Purchasing | In-app + push + SMS |
| Out of Stock | Purchasing | In-app + push |
| In Progress, Complete | Purchasing / Warehouse | In-app |

The dashboard only *delivers* in-app alerts. `channels` records where each notification should go so a backend can send email, push or SMS.

Unacknowledged notifications escalate after 30 min (Critical), 60 min (Out of Stock), 120 min (Replenish) or 240 min (Hold). Escalation marks the notification, adds an activity entry and makes it unread again. Times are editable in settings; 0 disables escalation.

## Lifecycle

`open` → `acknowledged` → `resolved`. Available actions (store methods): `acknowledge`, `assign` (role + optional name), `resolve`, `markRead`, `clearResolved`. Info-level notifications never raise the unread badge; warning and critical ones do.

## Extending it

- **Send real emails / push / SMS:** call your service from a new effect or server route whenever `syncNotifications()` returns new notifications, using `toPayload()` as the body and `channels` to pick the transport.
- **Per-SKU thresholds:** change `evaluateLevel()` callers in `syncNotifications()` to look up an override per variant instead of the single `NotificationSettings`.
- **Multiple locations:** `location_id` is a constant (`main`) today because stock is tracked per variant, not per warehouse.
- **Move to a database:** `NotificationsData` (`notifications`, `states`, `history`) maps to three tables; the pure functions stay as they are.

## Known limits

- Alerts and their settings are stored in the database (documents `notifications_data` / `notifications_settings`), so the whole team shares one alert list and read state. Alerts are computed by whichever browser is open when stock changes and reconciled on load.
- There is no user identity yet, so actions are recorded as "You".
