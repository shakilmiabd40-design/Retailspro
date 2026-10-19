-- RetailPro schema (PostgreSQL 13+; works on Neon, Aiven or any Postgres).
-- Safe to run repeatedly:  npm run db:setup
--
-- Business data is stored as JSON documents so the app's existing business rules
-- (stock reservation, warranties, settlements…) stay in one place; users, roles,
-- sessions and the audit log are proper relational tables.

-- ── Access control ─────────────────────────────────────────────────────────
create table if not exists app_roles (
  id           text primary key,
  name         text not null,
  description  text not null default '',
  built_in     boolean not null default false,
  locked       boolean not null default false,          -- Super Admin: always every permission
  permissions  jsonb   not null default '{}'::jsonb,
  created_at   timestamptz not null default now()
);
create unique index if not exists app_roles_name_key on app_roles (lower(name));

create table if not exists app_users (
  id                   text primary key,
  name                 text not null,
  email                text not null,                    -- email or username
  phone                text not null default '',
  role_id              text not null references app_roles (id),
  status               text not null default 'active' check (status in ('active', 'blocked')),
  password_hash        text not null,                    -- scrypt, never the password itself
  must_reset_password  boolean not null default false,
  failed_attempts      integer not null default 0,
  locked_until         timestamptz,
  last_login           timestamptz,
  notes                text,
  created_at           timestamptz not null default now()
);
create unique index if not exists app_users_email_key on app_users (lower(email));

create table if not exists app_sessions (
  token_hash    text primary key,                        -- sha-256 of the cookie value
  user_id       text not null references app_users (id) on delete cascade,
  created_at    timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  expires_at    timestamptz not null
);
create index if not exists app_sessions_user_idx on app_sessions (user_id);

-- ── Business data ──────────────────────────────────────────────────────────
-- One row per entity (product, order, supplier…). `version` gives optimistic
-- concurrency so two people editing the same record can't silently overwrite each other.
create table if not exists app_records (
  collection  text        not null,
  id          text        not null,
  seq         bigint generated always as identity,       -- newest first = highest seq
  data        jsonb       not null,
  version     integer     not null default 1,
  updated_at  timestamptz not null default now(),
  updated_by  text,
  primary key (collection, id)
);
create index if not exists app_records_order_idx on app_records (collection, seq desc);

-- Singleton documents: settings, product catalog, settlement ledger, notification state.
create table if not exists app_documents (
  key         text        primary key,
  data        jsonb       not null,
  version     integer     not null default 1,
  updated_at  timestamptz not null default now(),
  updated_by  text
);

-- Change counter per collection/document — lets browsers cheaply notice other people's edits.
create table if not exists app_revs (
  name  text   primary key,
  rev   bigint not null default 0
);

-- Number sequences (ORD-, PO-, RET-, WAR-, CLM-) handed out atomically so two users never get the same number.
create table if not exists app_counters (
  name   text   primary key,
  value  bigint not null                                  -- the next number to hand out
);

-- ── Audit trail ────────────────────────────────────────────────────────────
create table if not exists app_audit_log (
  id         bigint generated always as identity primary key,
  at         timestamptz not null default now(),
  user_id    text,
  user_name  text not null,
  module     text not null,
  action     text not null,
  entity     text not null,
  summary    text not null,
  before     jsonb,
  after      jsonb,
  device     text
);
create index if not exists app_audit_at_idx on app_audit_log (at desc);
create index if not exists app_audit_user_idx on app_audit_log (user_id);

-- ── POS upgrade (safe to re-run) ───────────────────────────────────────────
-- Roles are stored in the database, so the built-in ones created before the POS module existed get
-- their POS permissions here. A role that already has a "pos" entry (someone customised it) is left alone.
update app_roles
   set permissions = permissions || jsonb_build_object('pos', '["view","create","edit","delete","approve","export","financial"]'::jsonb)
 where id = 'role-manager' and not (permissions ? 'pos');

update app_roles
   set permissions = permissions || jsonb_build_object('pos', '["view","export","financial"]'::jsonb)
 where id = 'role-accounts' and not (permissions ? 'pos');

-- New built-in Cashier role. `do nothing` (no conflict target) also skips it if a custom role is already named "Cashier".
insert into app_roles (id, name, description, built_in, locked, permissions)
values (
  'role-cashier', 'Cashier',
  'Runs the POS: sells, gives limited discounts and prints receipts. Can''t void, approve returns or see cost.',
  true, false,
  '{"pos":["view","create"],"products":["view"],"warranty":["view"]}'::jsonb
)
on conflict do nothing;

-- ── Column cleanup (safe to re-run) ────────────────────────────────────────
-- These were written on every login / password change / audit entry but never read back anywhere in
-- the app (no "active sessions" or "sign-in IP" screen exists, and no password-expiry policy uses
-- password_changed_at). Dropped to stop growing storage on a capped free-tier database for no benefit.
-- `create table if not exists` above won't touch a table that already exists, so this drops them
-- explicitly for databases that were set up before this cleanup.
alter table if exists app_sessions  drop column if exists user_agent;
alter table if exists app_sessions  drop column if exists ip;
alter table if exists app_users     drop column if exists password_changed_at;
alter table if exists app_audit_log drop column if exists ip;

-- ── Public API & webhooks (website / partner integrations) ─────────────────
-- API keys: only the SHA-256 of the key is stored; the key itself is shown once when created.
create table if not exists app_api_keys (
  id            text primary key,
  name          text not null,                           -- e.g. "Sabsan website"
  key_prefix    text not null,                           -- first characters, so people can recognise a key
  key_hash      text not null unique,
  scopes        text[] not null default '{}',            -- products:read, orders:read, orders:write
  status        text not null default 'active' check (status in ('active', 'revoked')),
  created_by    text,
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz
);

-- Outgoing webhooks: RetailPro POSTs signed events to these URLs.
create table if not exists app_webhooks (
  id                    text primary key,
  name                  text not null default '',
  url                   text not null,
  secret                text not null,                   -- HMAC signing secret (needed in clear to sign)
  events                text[] not null default '{}',    -- e.g. order.created, stock.updated, or '*'
  active                boolean not null default true,
  consecutive_failures  integer not null default 0,
  created_at            timestamptz not null default now()
);

-- Outbox: written in the same transaction as the change, delivered afterwards with retries.
create table if not exists app_webhook_deliveries (
  id               text primary key,                     -- evt_… (same id on every retry)
  seq              bigint generated always as identity,  -- creation order, so events go out in the order they happened
  webhook_id       text not null references app_webhooks (id) on delete cascade,
  event_type       text not null,
  payload          jsonb not null,
  status           text not null default 'pending' check (status in ('pending', 'delivered', 'failed')),
  attempts         integer not null default 0,
  next_attempt_at  timestamptz not null default now(),
  last_status      integer,
  last_error       text,
  created_at       timestamptz not null default now(),
  delivered_at     timestamptz
);
create index if not exists app_webhook_deliveries_due_idx on app_webhook_deliveries (status, next_attempt_at);
create index if not exists app_webhook_deliveries_hook_idx on app_webhook_deliveries (webhook_id, created_at desc);

-- Speeds up API lookups: "this website's order with external id X" and "which product has SKU Y".
create unique index if not exists app_api_keys_name_key on app_api_keys (lower(name));
create index if not exists app_records_order_ext_idx on app_records ((data->>'channel'), (data->>'externalId')) where collection = 'orders';
create index if not exists app_records_product_gin_idx on app_records using gin (data jsonb_path_ops) where collection = 'products';

-- ── Accounting module: give the built-in Manager and Accounts roles access on existing installs ─────
-- (New installs get it from the role presets. Custom roles are left alone — a Super Admin can tick Accounting in Users & Roles.)
update app_roles
   set permissions = permissions || '{"accounting":["view","create","edit","delete","export"]}'::jsonb
 where id in ('role-manager', 'role-accounts') and built_in and not (permissions ? 'accounting');

-- ── Low-stock email alerts: sends at most once per inventory notification ───
create table if not exists app_sent_notification_emails (
  notification_id  text primary key,
  sent_at           timestamptz not null default now()
);
