CREATE TABLE IF NOT EXISTS manuscripts (
  id uuid PRIMARY KEY,
  name text NOT NULL,
  notion_root_id text NOT NULL,
  notion_root_type text NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS manuscript_sources (
  id uuid PRIMARY KEY,
  manuscript_id uuid NOT NULL REFERENCES manuscripts(id) ON DELETE CASCADE,
  notion_page_id text NOT NULL,
  title text NOT NULL,
  included boolean NOT NULL DEFAULT true,
  sort_order integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS sync_runs (
  id uuid PRIMARY KEY,
  manuscript_id uuid NOT NULL REFERENCES manuscripts(id) ON DELETE CASCADE,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  status text NOT NULL,
  error_summary text
);

CREATE TABLE IF NOT EXISTS word_count_snapshots (
  id uuid PRIMARY KEY,
  sync_run_id uuid NOT NULL REFERENCES sync_runs(id) ON DELETE CASCADE,
  manuscript_id uuid NOT NULL REFERENCES manuscripts(id) ON DELETE CASCADE,
  source_id uuid NOT NULL REFERENCES manuscript_sources(id) ON DELETE CASCADE,
  word_count integer NOT NULL,
  captured_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS word_count_snapshots_manuscript_captured_idx
  ON word_count_snapshots(manuscript_id, captured_at DESC);
