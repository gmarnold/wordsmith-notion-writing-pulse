# Wordsmith

I built Wordsmith because I wanted to draft and organize my novels in Notion without giving up the writing-progress tools I loved in dedicated writing software.

My first prototype now works against real Notion writing databases: it discovers scenes, counts their prose and displays manuscript totals. In iteration 2, I extend that architecture with automatic scene recounts, mapped Notion properties, writing goals and a compact read-only dashboard designed for Notion embeds.

Notion batches page-content webhook events, so Wordsmith updates shortly after editing rather than on every individual keystroke. My local webhook and embed now work. Iteration 3 prepares the hosted service so I can close my computer and keep writing in Notion; the production account setup and computer-off release test remain pending.

## Current features

- Inspect a Notion page, database or data source and choose included writing pages.
- Keep scene absolute Word Count separate from manuscript Today Net.
- Verify raw webhook bytes with the official Notion SDK, deduplicate events and debounce per-scene recounts.
- Persist count history, sync state, goals, timezone, property IDs and a durable webhook inbox in PostgreSQL.
- Write only changed mapped Number/Date values back to Notion, with feedback-loop protection.
- Configure daily, weekly, monthly and total goals in the existing web app.
- Preview a responsive cream/lavender literary dashboard with a random, revocable read-only embed link.
- Run a deterministic credential-free demo, including simulated scene edits, without PostgreSQL.
- Keep manuscript prose out of persisted history and embeds.

## Architecture

```text
Notion -> verified webhook -> Wordsmith API -> word-count engine
       -> PostgreSQL analytics history -> Notion property write-back
       -> Wordsmith dashboard / embed
```

This remains a small TypeScript monorepo: `apps/web` (React/Vite), `apps/api` (Fastify/Drizzle/PostgreSQL), `packages/notion` (adapter and counting engine), `packages/shared` (contracts), and `docs` (decisions/setup).

## Hosted architecture

I use one paid Render Node service for the admin app, API, signed webhook and read-only widget, with managed PostgreSQL for saved manuscripts, mappings, goals and history. Production uses stable HTTPS and requires no local Node process, Docker or Cloudflare tunnel. The admin requires a password-hash login and secure database-backed session; embeds keep their separate revocable read-only links. I configure my existing internal Notion connection through hosting secrets, not frontend code.

The service is prepared in `render.yaml`; creating the resources and accepting their charges happens only in my own hosting account. I have not deployed production yet. I follow the [production deployment checkpoints](docs/PRODUCTION_DEPLOYMENT.md) and treat the [computer-off validation](docs/ALWAYS_ON_VALIDATION.md) as the release gate. GitHub CI must pass before normal auto-deployment.

## Local demo

Install Node.js 22.12+ (or supported Node 24) and run from the repository root:

```powershell
npm install
# Only copy this template if you do not already have apps/api/.env:
Copy-Item .env.example apps/api/.env
npm run build
npm run dev
```

Open `http://localhost:5173`, inspect `demo`, then Sync now. With `WORDSMITH_DEMO_MODE=true`, no database or credentials are used. Try Simulate scene edit, goal configuration and Create embed link. The public-only embed/webhook listener runs on `http://localhost:4142`; private setup stays on `http://localhost:4141`. Build web assets before using the public embed preview, and rebuild after UI changes.

## Real Notion setup

I keep secrets directly in `apps/api/.env`. For persistent live tracking I set `WORDSMITH_DEMO_MODE=false`, provide `DATABASE_URL` and my existing `NOTION_TOKEN`, start PostgreSQL and run `npm run db:migrate`.

- [Native PostgreSQL on Windows (Docker optional)](docs/POSTGRESQL_SETUP.md)
- [Connect and share Notion sources](docs/NOTION_SETUP.md)
- [Local webhook development](docs/LOCAL_WEBHOOK_DEVELOPMENT.md)
- [Embed in Notion](docs/NOTION_EMBED_SETUP.md)
- [Native architecture and baseline decisions](docs/NOTION_NATIVE_ARCHITECTURE.md)
- [Architecture](docs/ARCHITECTURE.md) and [word-count rules](docs/WORD_COUNT_RULES.md)

I add a Number property in Notion, select its stable ID in Wordsmith, save settings and sync. Wordsmith does not silently add properties to my database. I configure the HTTPS webhook subscription myself and never paste tokens into chat. Only port 4142 is intended for the tunnel; localhost is not a normal remote Notion embed URL.

## Validation

```powershell
npm run lint
npm run typecheck
npm test
npm run build
npm run e2e
```

Tests cover the existing count/discovery behavior, raw signatures, duplicates/debounce/retries, changed-property writes, loops, timezone/DST/baselines and embed revocation. A development-only embedded PostgreSQL test validates additive SQL and durable repository behavior without Docker. Browser tests exercise manual inspection, automatic demo sync and narrow embeds.

## Privacy and current limits

I process manuscript prose in memory and persist derived analytics, Notion IDs, page titles, counts, timestamps and configuration. Notion secrets stay on the server. Embed tokens are bearer links; only hashes are stored, and links can be rotated/revoked.

This remains a personal, single-integration service with one hosted worker instance. I retain local fixture/demo mode for development and CI; production rejects it. New scenes are not automatically enrolled, source membership changes and historical goal versions are deferred, and newly created pages conservatively establish baselines. Public OAuth, multiple-user accounts, product billing, AI writing, grammar/style tools and frequency analysis remain later work. The [iteration 3 report](docs/ITERATION_3_REPORT.md) tracks the implementation and outstanding hosting release gate.
