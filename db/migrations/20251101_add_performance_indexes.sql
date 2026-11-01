-- Performance indexes for slow queries
-- Run with CONCURRENTLY in production where possible (some statements may need non-concurrent in transaction blocks)

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_app_sessions_token_hash ON app_sessions (token_hash);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_app_sessions_expires_at ON app_sessions (expires_at);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_app_sessions_user_id ON app_sessions (user_id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_app_users_id ON app_users (id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_app_users_role_id ON app_users (role_id);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_app_roles_id ON app_roles (id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_app_records_collection_seq ON app_records (collection, seq DESC);
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_app_records_collection_id ON app_records (collection, id);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_app_revs_name ON app_revs (name);

CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_app_counters_name ON app_counters (name);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_app_audit_log_at_id ON app_audit_log (at DESC, id DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_app_records_orders_channel_ext ON app_records ((data->>'channel'), (data->>'externalId')) WHERE collection = 'orders';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_app_records_orders_status ON app_records ((data->>'status')) WHERE collection = 'orders';
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_app_records_orders_created_at ON app_records ((data->>'createdAt')) WHERE collection = 'orders';
