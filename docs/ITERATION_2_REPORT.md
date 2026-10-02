# Iteration 2 report

Status: implementation and local validation complete. Native PostgreSQL is configured and migrated, the user has established manuscript tracking and a working embed, and both a signed diagnostic and a real Notion event processed successfully. Docker deployment remains untested.

## 1. What changed

I extended the existing prototype with signed, durable, debounced page-content webhook processing, affected-scene recounts, stable Notion property mapping/write-back, timezone-aware observed-delta analytics, four goal types, a compact protected embed and credential-free demo edit simulation. Manual inspection and the existing count engine remain in place.

## 2. Current architecture

Notion edit → raw-byte signature verification → PostgreSQL inbox → per-page debounce → existing counting adapter → source snapshot/sync run → changed mapped Notion properties → complete manuscript stats → web dashboard/embed. The private configuration API binds to loopback on 4141; a separate public-only listener runs on 4142. Dashboards poll Wordsmith's own stats every 15 seconds; Notion content remains webhook-driven. Run one API worker process.

## 3. Main modules/files

- Existing adapter: `packages/notion/src/blocks.ts`; demo fixture: `fixtures.ts`.
- Shared settings/goal/timezone contracts: `packages/shared/src/index.ts`.
- API: `analytics.ts`, `properties.ts`, `syncEngine.ts`, `syncStore.ts`, `webhooks.ts`, `publicServer.ts`.
- Existing API wiring/persistence: `service.ts`, `repository.ts`, `server.ts`, `config.ts`, `index.ts`, `db/client.ts`, `db/schema.ts`.
- Persistence additions: `db/syncSchema.ts`, `db/migrate.ts`, SQL migration below.
- Web: existing `App.tsx`/styles/API helper plus `Configuration.tsx`, `Embed.tsx` and embed routing in `main.tsx`.
- Tests: existing count/discovery/manual-sync tests plus `syncEngine.test.ts`, `webhooks.test.ts`, `persistence.test.ts`, and the extended browser demo test.
- Documentation: README, ARCHITECTURE, WORD_COUNT_RULES, WEBHOOK_SETUP, NOTION_NATIVE_ARCHITECTURE, NOTION_EMBED_SETUP and this report.
- Environment templates, gitignore, lockfile and Playwright/Vite settings were updated. Browser tests now use ports 4241/4242/5273 rather than reusing another application's development server.

## 4. Database migration

`apps/api/drizzle/0001_sync_foundation.sql` adds `manuscript_settings` (JSONB settings, timezone, four optional goals, stable property IDs and embed hash), `webhook_events` (unique event ID, affected page, receipt/availability timestamps, state, attempt count) and history/inbox indexes. Existing manuscripts/sources/runs/count history are preserved. No prose or webhook payload body is added.

The repository had an initial SQL migration but no Drizzle migration journal, so `npm run db:migrate` now uses a small transaction/advisory-lock SQL runner with an applied-files ledger. Its SQL and repositories were validated using development-only PGlite, an actual embedded PostgreSQL engine. Both migrations were subsequently applied successfully to native PostgreSQL 18. Docker Desktop's engine was unavailable, so Docker deployment remains untested.

## 5. Verification

The installed Notion SDK supplies `verifyWebhookSignature`. A route-scoped Fastify raw-buffer parser preserves incoming bytes, and the SDK checks X-Notion-Signature using HMAC-SHA256 and `NOTION_WEBHOOK_VERIFICATION_TOKEN`. Unsigned events are rejected. The unsigned initial handshake is accepted only with explicit setup mode enabled and no configured token; it writes an ignored local file once, without logging the token. Turn setup mode off after verification.

## 6. Debounce and idempotency

Unique event IDs are persisted before acknowledgement, duplicates are ignored, and repeated page events coalesce until three seconds after the latest queued event. A one-second worker processes only affected pages. Manual and automatic recounts are serialized through the same engine. Failed groups retry after 30 seconds. Pending events survive restart. If a count already persisted before failure, its unchanged retry creates no duplicate automatic count snapshot. Completed event metadata is retained for 30 days; unchanged counts still no-op after that dedup window. This iteration has no distributed worker claims.

## 7. Feedback-loop prevention

Only page.content_updated is processed. Property-update events are ignored. Notion fields are PATCHed only when their current values differ. Unchanged automatic recounts do not create another snapshot or advance Last Counted. The tests explicitly replay a content event after Wordsmith's own property write and verify that it produces no further PATCH.

## 8. Word Count and Last Counted

The UI discovers Number/Date properties in the selected database/data source and stores IDs, so renames survive. Only those mapped IDs appear in a page update. Missing/deleted/wrong-type mappings cause a sanitized failed sync and retained history. Add properties manually in Notion, then map them; schema creation is supported by Notion's current API but deliberately deferred pending a safe creation preview/collision workflow. Last Counted uses the successful persisted count snapshot time and is unchanged for failed counts or automatic no-ops.

## 9. Native global progress decision

I chose per-scene Word Count plus one read-only manuscript embed. This avoids O(scene count) global-value writes. The comparison of duplicated row values, companion status record/relations/rollups and the chosen embed is in [NOTION_NATIVE_ARCHITECTURE.md](NOTION_NATIVE_ARCHITECTURE.md). The same widget can be embedded inside a scene; a guided companion status record can come later.

## 10. Exact baselines and periods

The first observation of every source is zero-delta baseline, including newly tracked existing pages and genuinely new pages. Subsequent delta = current count − previous observed count for that source. Sum deltas across sources by observation time in the configured IANA timezone: calendar day, Monday-start week, calendar month. Periods with no observations add zero. Without a boundary snapshot, an unobserved edit is attributed to the next observation period, not guessed. DAILY/WEEKLY/MONTHLY use these net values; TOTAL uses current absolute count. Negative deltas remain signed. Timezone changes reinterpret history; goal targets currently describe the current goal, not historical goal versions.

Exact example passes: 1000/500 baseline → 1100/600 gives +200 Today Net and 40% of a 500 goal; 1050/600 gives +150 and 30%. Observed additions/removals derive from count deltas and are not exact gross keystroke counts. Source membership is chosen at manuscript creation; automatic enrollment and editable membership/history remain later work.

## 11. Embed access

An opaque 256-bit random bearer token grants read-only access. Only its SHA-256 hash is stored. Rotation/revocation invalidates previous links. The stats payload omits IDs, scene titles, prose, credentials and sync errors. Responses are no-store/no-referrer; the public listener has request logging disabled. A loaded embed clears stats on its next failed poll. Link holders can view the displayed derived analytics; this is not user authentication, and reverse proxies/Notion can see the bearer URL. Keep configuration private and redact proxy token-path logs.

## 12. Exact manual webhook setup

Follow [WEBHOOK_SETUP.md](WEBHOOK_SETUP.md): start PostgreSQL; keep secrets locally in apps/api/.env; set demo false, setup true and verification-token empty; migrate/build; start `npm run dev:api` and `npm run dev:web`; run `cloudflared tunnel --url http://localhost:4142`; create the Notion webhook subscription at `https://YOUR-HOST/api/webhooks/notion` for page.content_updated; read apps/api/.webhook-verification-token locally; verify in Notion and set that same token as NOTION_WEBHOOK_VERIFICATION_TOKEN in .env; set setup false and restart the API. Edit one included scene and confirm `Automatic scene sync` status success, mapped Number change, +/− stats change and an empty queue. Do not paste tokens into chat. The full numbered guide includes capabilities, tunnel installation, changed-URL handling and troubleshooting evidence.

## 13. Exact manual embed setup

Follow [NOTION_EMBED_SETUP.md](NOTION_EMBED_SETUP.md): create a link in configuration, preview it, replace localhost:4142 with your HTTPS public origin (or configure PUBLIC_ORIGIN server-side), open the Notion project page, type /embed, paste the full HTTPS embed URL, resize and drag it above Scenes. A temporary HTTPS tunnel works for testing; stable hosted HTTPS is required for dependable daily use. Localhost is not a normal remote Notion embed URL.

## 14. Validation results

- Installation completed; existing dependency audit findings remain: 9 total (6 moderate, 2 high, 1 critical). No broad dependency upgrades or force-fix were applied.
- Baseline before feature edits: lint/typecheck/build passed; 14 tests passed.
- Final lint: passed.
- Final TypeScript project typecheck: passed.
- Final automated tests: 34 passed across 7 files, including PostgreSQL migration/durable-store coverage and local configuration origin aliases.
- Final production builds: all four workspaces passed.
- Final Chromium browser tests: 2 passed, including existing manual inspection plus configured goals, +100 automatic demo progress, narrow layout and embed revocation.
- The 320-pixel screenshot was visually reviewed; `test-results/embed-narrow.png` is a local ignored validation artifact.
- `git diff --check`: clean.
- Real Notion webhook delivery: a real event processed successfully; a separate signed diagnostic passed through the public tunnel and worker. The user confirmed the widget works with manual sync. Independent confirmation of the mapped property values and stable external deployment remains outstanding.

## 15. Iteration 3

Guided schema creation with a preview, source membership editing/new-page enrollment, an optional companion status record, historical goal versions, more efficient indexed history summaries, distributed claims and retry/dead-letter controls when scaling, stable HTTPS deployment and dependency maintenance. Public OAuth/account security is a separate milestone. Word/phrase frequency analysis still needs explicit normalization/privacy rules and is not implemented. AI writing, grammar correction, billing and editor replacement are outside this iteration.

## Native PostgreSQL follow-up

Docker Desktop could not start because hardware virtualization is disabled in firmware. I continued with the installed native PostgreSQL 18 Windows service instead. A new wordsmith database and dedicated non-superuser login were provisioned, generated credentials were saved only in apps/api/.env, and both SQL migrations were applied successfully. Queries verified the application connection and migration ledger. The user subsequently added a manuscript with 19 included sources. Automatic sync was initially blocked because the captured verification token had not been configured. The token was transferred locally into the ignored environment file, setup mode was disabled, and the running API was reloaded. A signed public diagnostic and a real Notion event both finished successfully with no pending inbox events. No credentials or captured token are included in Git.

## Audit adaptations

The current adapter already supports data sources and the working real Scenes database path, so it was retained. Totals previously used only the latest run; that was corrected to use each source's latest snapshot so single-scene and partial syncs do not erase other counts. Old period math used the execution host's timezone; it now uses the configured writer timezone. Demo mode now bypasses a configured production database, shell test overrides win over local .env, and missing live Notion credentials no longer silently select fixture content. The restart interrupted the final pass; I resumed saved work, fixed SQL BOM handling, isolated browser ports from the existing portfolio server, corrected empty-POST headers, completed documentation and reran validation.
