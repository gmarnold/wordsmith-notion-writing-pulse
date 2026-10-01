# Wordsmith

I built Wordsmith because I wanted to draft and organize my novels in Notion without giving up the writing-progress tools I loved in dedicated writing software.

Wordsmith connects to a Notion writing project, counts manuscript pages, and builds a history of writing progress without needing to store the manuscript itself. This is an early prototype: it is meant to prove the Notion connection, word-count engine, snapshot history, and dashboard before growing into a public integration.

## Current features

- Inspect a Notion parent page or database from a pasted URL or ID.
- Discover child writing pages and count their prose blocks.
- Save manuscripts, sync runs, and word-count snapshots in PostgreSQL.
- Show total words, chapter counts, recent syncs, and snapshot-based net change.
- Run in demo mode without Notion credentials.
- Keep raw manuscript prose out of the database.

## Architecture

This is a small TypeScript monorepo using npm workspaces.

- `apps/web`: React, Vite, accessible prototype UI.
- `apps/api`: Fastify API, Drizzle, PostgreSQL, Notion connection.
- `packages/notion`: Notion traversal, fixture client, word-count rules.
- `packages/shared`: Zod schemas and shared API types.
- `docs`: setup, architecture, word-count rules, roadmap.

## Local setup

Install Node.js 22 or newer, then run:

```bash
npm install
cp .env.example apps/api/.env
docker compose up -d
npm run db:migrate
npm run dev
```

Open `http://localhost:5173`. Demo mode is enabled by default in `apps/api/.env`, so you can inspect the sample manuscript by leaving the input as `demo`.

## Notion setup

Follow [docs/NOTION_SETUP.md](docs/NOTION_SETUP.md) to create an internal Notion connection, put the token in `apps/api/.env`, and share a writing page or database with Wordsmith.

## Test commands

```bash
npm run lint
npm run typecheck
npm test
npm run build
npm run e2e
```

## Privacy model

Wordsmith reads Notion blocks in memory, extracts countable text, calculates word counts, and persists only derived statistics and configuration metadata. It stores Notion page IDs, page titles, included/excluded source settings, sync run status, word counts, and timestamps. It does not store full paragraphs or manuscript prose.

## Known limitations

This prototype uses an internal Notion token for my own workspace. It does not include public OAuth, hosted multi-user accounts, scheduled sync, encrypted token storage, Notion write-back, goals, heatmaps, or AI writing features.
