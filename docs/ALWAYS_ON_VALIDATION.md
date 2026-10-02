# Always-on release validation

**Release gate: pending.** Record real production evidence below. Fixture tests and a successful build do not substitute for this test.

## Preconditions

- Production is deployed to its stable public HTTPS URL.
- Managed PostgreSQL is connected and migrations have passed.
- The permanent Notion subscription is active and points to hosted Wordsmith.
- Human or Dancer and its property mappings/goals are configured in hosted Wordsmith.
- The Notion embed uses the production bearer URL.
- The old tunnel subscription has been disabled/deleted after successful cutover.

## Computer-off test

1. Confirm production `/api/health` returns HTTP 200 and green database/configuration indicators.
2. Confirm the authenticated Wordsmith admin shows Human or Dancer configured, with the expected tracked scenes, settings and goals. Record the current scene count and total.
3. Stop **all** local Wordsmith processes (API, web development server and any local workers).
4. Stop Cloudflare Tunnel, including any separate tunnel terminal/background instance you started.
5. Close VS Code.
6. Confirm the localhost Wordsmith web/API URLs are unavailable; the unrelated portfolio application is not part of this test.
7. Edit the body of one tracked Notion scene, adding a known number of ordinary words.
8. Wait for Notion's batched webhook delivery window (usually one or two minutes), the debounce/recount, and the embed's next visible 15-second refresh.
9. Verify all of the following against the **production** service:
   - A verified event is logged for the edited tracked page.
   - The scene recount completes successfully.
   - The mapped Word Count property changes by the expected amount; optional Last Counted is appropriate.
   - A new snapshot and successful sync run appear in hosted history (the stats/history API is available only to the authenticated admin).
   - The full manuscript total and observed net progress change correctly.
   - The Notion embed shows the hosted values without iframe login.
10. Shut down/reboot the computer if desired. For the strongest computer-off proof, make another edit from Notion on a phone/second device while the development computer is powered off.
11. Open Notion again the next day.
12. Confirm another edit still updates properties and the embed without starting any local service. Sign in to hosted Wordsmith and confirm the saved configuration, goals and history remain.

## Persistence/redeploy test

Redeploy the same passing revision or restart the hosted service. Confirm the saved manuscript, property IDs, goals, history and existing embed link remain. Repeat the edit check. Do not reset the database or generate a new embed merely to make this test pass.

## Evidence record

| Evidence | Result |
| --- | --- |
| Production base URL / deployed revision | Pending |
| Health check, database connected | Pending |
| All local processes stopped / tunnel stopped | Pending |
| Production webhook event ID and time | Pending |
| Scene count before → after; property write | Pending |
| Hosted snapshot/sync and total/net changes | Pending |
| Signed-out embed and computer-off edit | Pending |
| Next-day edit and persisted configuration | Pending |
| Hosted restart/redeploy persistence | Pending |
| Release decision | **Not released until all checks pass** |

Record metadata/counts only. Do not include prose, tokens, passwords, connection strings or full bearer embed URLs in this document or chat.
