CREATE TABLE IF NOT EXISTS admin_sessions (
 token_hash text PRIMARY KEY,
 expires_at timestamptz NOT NULL
);
CREATE INDEX IF NOT EXISTS admin_sessions_expiry ON admin_sessions(expires_at);
CREATE TABLE IF NOT EXISTS integration_state (
 id text PRIMARY KEY,
 kind text NOT NULL DEFAULT 'internal_environment',
 workspace_name text,
 setup_nonce_hash text,
 setup_token_cipher text,
 setup_expires_at timestamptz
);
