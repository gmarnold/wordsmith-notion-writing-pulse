# Architecture

Wordsmith keeps the first iteration small and inspectable.

```text
browser
  |
React web app
  |
Fastify API
  |
  +-- Notion API
  |     |
  |     page blocks
  |     |
  |     in-memory text extraction
  |
  +-- PostgreSQL
        |
        snapshots and history
```

The Notion token is backend-only because Vite client variables are visible to the browser. The browser sends page or database URLs to the API; the API parses IDs, talks to Notion, and returns safe derived results.

Raw prose is not persisted. Wordsmith reads block text into memory, counts words, and discards the text. PostgreSQL stores manuscript metadata, source page IDs and titles, sync runs, word-count snapshots, and timestamps.

Snapshot deltas are labeled as net changes because Wordsmith compares totals from completed syncs. If a manuscript goes from 10,000 words to 9,800 words, the correct net change is -200. That is not the same as words typed.

Manual sync comes before scheduled jobs because it is easier to reason about access, errors, and history while the Notion model is still being proven. Public OAuth can be added later by replacing the single server-side token with per-user authorization and secure token storage.
