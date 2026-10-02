# Architecture

I extend the working first prototype rather than replacing it. The TypeScript workspace remains React/Vite, Fastify, the existing Notion adapter, Drizzle and PostgreSQL.

```text
Notion scene edit
  -> aggregated page.content_updated event
  -> public listener :4142 /api/webhooks/notion
  -> raw-byte official SDK HMAC verification
  -> PostgreSQL event inbox (event ID primary key)
  -> one API worker: per-page 3-second debounce, serialized recount
  -> existing in-memory block traversal and word-count engine
  -> per-source word-count snapshot and sync run
  -> PATCH only changed mapped Number/Date properties
  -> manuscript stats from latest snapshot of each included source
  -> web dashboard / read-only embed (15-second Wordsmith stats polling)
```

The local configuration API stays on :4141, the development web app on :5173. Public listener :4142 exposes no setup, goal editing, manuscript enumeration, Notion inspection or manual sync APIs. Both API listeners bind to loopback; HTTPS reverse proxy/tunnel reaches only :4142. Private configuration requests validate the Host and Origin. This prototype is intended for one writer and one API process; it is not a hosted multi-user management API.

## Modules and persistence

- `packages/notion/src/blocks.ts`: unchanged discovery/counting path plus schema inspection and property PATCH support. Database/data-source resolution remains compatible with the working Scenes database use case.
- `packages/shared/src/index.ts`: validated timezone, four goal types and stable property mappings.
- `apps/api/src/analytics.ts`: complete totals from each source's latest count and timezone-based sums of observed deltas.
- `apps/api/src/syncEngine.ts`: serialized manual/automatic recounts, write-back recovery and embed rotation/revocation.
- `apps/api/src/syncStore.ts`: PostgreSQL inbox/settings access with deterministic in-memory demo equivalents.
- `apps/api/src/webhooks.ts`: scoped raw-buffer request parser, opt-in verification handshake and signed events.
- `apps/api/src/publicServer.ts`: restricted public routes and built embed assets.
- `apps/web/src/Configuration.tsx` and `Embed.tsx`: existing UI configuration extension and compact dashboard.

Existing manuscripts, sources, sync runs and snapshots are retained. `0001_sync_foundation.sql` adds typed manuscript settings in JSONB (timezone, DAILY/WEEKLY/MONTHLY/TOTAL goals and property IDs), an embed token hash and the webhook inbox with ID/page/received time/available time/status metadata. Snapshots already hold source/manuscript/run IDs, absolute count and observation time; previous count and delta are derived. No raw webhook body or manuscript prose is persisted. Source inclusion is stored on the tracked-source record and remains fixed for that tracking configuration in this slice.

The original repository had hand-written `0000_initial.sql` but no Drizzle migration journal. The small explicit SQL runner now handles that file and the additive migration, uses a transaction/advisory lock and tracks applied file names. It recognizes the existing initial schema. Continue using reviewed SQL migrations with this runner; `db:generate` is a schema-design aid, not an automatically applied migration pipeline.

## Debounce, retries and loops

The endpoint acknowledges only after a tracked event has been persisted. Repeated event IDs use INSERT ON CONFLICT DO NOTHING. Pending events are grouped by normalized page ID and wait until all events in that group have reached their 3-second availability time. A worker runs every second and fetches only the affected page's blocks. New events arriving during work remain pending for a subsequent pass.

Manual sync and automatic jobs share one serialized engine. Failure retains existing history and leaves the group pending for a 30-second retry. A persisted count is compared with the latest count before creating another automatic snapshot, so replay after a crash or failed property write does not duplicate observed history. A crash before inbox completion leaves events pending for restart recovery. Successful event metadata is retained for 30 days; very old replays can recount but unchanged counts still create no duplicate snapshots.

Only `page.content_updated` is processed; property events are ignored. Writes compare the current Number/Date values against mapped target values, using stable IDs and normalized dates. An unchanged content event creates no automatic snapshot and does not advance Last Counted, so even a content event after Wordsmith's own property write ends with no PATCH. Count failures do not update Last Counted. Write failures can leave valid count history awaiting property repair; sync status explains the failure rather than deleting history.

This is intentionally a **single API process** design. Inbox rows are not claimed with cross-process leases. Do not run multiple worker replicas against one database. Distributed claims, backoff/dead-letter controls, indexed latest-count summaries and more comprehensive source membership auditing belong to the public-product milestone.

## Privacy and demo

Prose is read in memory and discarded. The API stores Notion IDs, page titles, counts, timestamps, settings and sanitized sync state. Notion credentials and verification tokens remain server-side environment variables. Opt-in handshake capture writes a git-ignored local token file; it does not print the token. Embeds expose only their narrow derived-statistics response.

Demo mode always uses the fixture Notion client and in-memory repositories, even when DATABASE_URL exists in local configuration. It requires no PostgreSQL, Notion or webhook credentials. Simulate scene edit adds 100 fixture words and uses the same inbox/recount/write-back flow. Unit fixtures also sign raw webhook payloads with a test-only secret. Shell environment values take precedence over local `.env` so automated demo tests cannot silently switch to a real manuscript.

See [Notion-native decisions](NOTION_NATIVE_ARCHITECTURE.md), [webhook setup](WEBHOOK_SETUP.md), [embed setup](NOTION_EMBED_SETUP.md) and [word-count rules](WORD_COUNT_RULES.md).
