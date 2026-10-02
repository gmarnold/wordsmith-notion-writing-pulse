CREATE TABLE IF NOT EXISTS manuscript_settings (
 manuscript_id uuid PRIMARY KEY REFERENCES manuscripts(id) ON DELETE CASCADE,
 settings jsonb NOT NULL,
 embed_hash text
);
CREATE TABLE IF NOT EXISTS webhook_events (
 id text PRIMARY KEY,
 page_id text NOT NULL,
 received_at timestamptz NOT NULL,
 available_at timestamptz NOT NULL,
 status text NOT NULL DEFAULT 'pending',
 attempts integer NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS webhook_events_pending ON webhook_events(status, available_at);
CREATE INDEX IF NOT EXISTS snapshots_source_time ON word_count_snapshots(source_id, captured_at);
