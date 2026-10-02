# Iteration 3: hosted deployment preparation

Status: implementation prepared and locally validated; external hosting checkpoints and the computer-off release gate are still pending. No Render/AWS resources were created, no AWS account or credentials were accessed, and no hosting charges were incurred. This report is not a claim of an always-on production release.

1. **Frontend URL:** pending account provisioning; the actual Render HTTPS base URL will serve the admin/login app.
2. **API URL:** the same origin, under `/api`. No separately configured frontend API host is required.
3. **Health URL:** `https://ACTUAL-HOST/api/health`; public safe database/configuration indicators, no secrets or manuscript data.
4. **Provider:** paid Render Node service plus paid Render PostgreSQL, selected for an always-running process, stable TLS, secrets, managed persistence and GitHub/CI deployment support. Current provider documentation was checked. Review the actual account-specific price before creating resources; free sleeping services do not meet this release gate.
5. **Architecture:** the diagram in [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md) shows Notion → hosted signed ingress → durable inbox → recount/property write → PostgreSQL → read-only embed, alongside authenticated administration.
6. **Database/migrations:** existing manuscripts, sources, goals/mappings and history retain their schema. Migration `0002_hosted_admin.sql` adds durable session hashes and integration/setup metadata. Numbered SQL is applied under one transaction/advisory lock with normalized checksums. Failed migrations prevent deployment without resetting data.
7. **Environment:** `NODE_ENV`, provider `PORT`, `DATABASE_URL`, `NOTION_TOKEN`, `ADMIN_PASSWORD_HASH`, `SESSION_SECRET`, `NOTION_WEBHOOK_VERIFICATION_TOKEN`, temporary `NOTION_WEBHOOK_SETUP`, and demo false. The explicit provider `RENDER_EXTERNAL_URL` supplies the default origin; `PUBLIC_ORIGIN` can override it. No production local-env loading or frontend secrets.
8. **Admin authentication:** generated password, server-side scrypt hash (N=32768, r=8, p=3), signed random eight-hour session with only its hash stored in PostgreSQL. Secure/HttpOnly/SameSite/host-only cookie, origin/header CSRF checks, bounded login attempts/concurrency, logout revocation. Public HTML has no private configuration; private API endpoints require the session.
9. **Embed access:** existing 256-bit random bearer links, stored as SHA-256 hashes, remain independently accessible without iframe login. Rotation/revocation remains in Settings. The embed cannot grant admin access and returns no prose, scene IDs or integration credentials.
10. **Webhook URL:** `https://ACTUAL-HOST/api/webhooks/notion`; the admin-generated subscription URL includes a one-use setup nonce query for initial verification. Keep the exact verified URL; the query is inert after signed event verification is configured. No tunnel host is used in production.
11. **Processing:** official SDK raw-byte HMAC validation, unique durable event IDs, tracked-source filtering, three-second debounce, affected-scene counting, changed mapped properties, safe retry/no-op behavior. A PostgreSQL advisory transaction lock serializes old/new workers across rolling deploys. Retain one instance.
12. **Restart persistence:** managed PostgreSQL stores the complete selected configuration/history, session hashes and embed hashes. Local state is not silently transferred. The UI reloads saved manuscripts and separates occasional Settings from normal Notion writing.
13. **GitHub deployment:** existing CI is preserved and extended with isolated PostgreSQL 18 migration/worker-lock coverage. The Blueprint uses `checksPass`; its automatic infrastructure sync is disabled at setup so infrastructure changes can be reviewed after CI. Initial/manual deploys must also use a passing revision.
14. **Logs:** safe structured event/page/run IDs, tracked status, counts, property performed/skipped, durations and categories. Default request logging is disabled to avoid bearer paths/verification query values; raw bodies and secrets are omitted. Inspect Render Logs/Deploys.
15. **Rollback/redeploy:** use Render's previous successful deployment/specific passing commit, retain the database, and remember code rollback does not reverse migrations or environment edits. Current SQL is additive; no destructive rollback/reset is implemented.
16. **One-time Human or Dancer setup:** production checkpoint D documents inspection, page selection, stable property IDs, Chicago timezone, goals, initial sync and reload verification. Hosted history begins with a new baseline; no local export/upload is performed.
17. **Webhook cutover:** checkpoint C documents the authenticated setup nonce, safe token retrieval/copy, Notion verification, hosting-secret configuration, setup-mode disable/redeploy, real edit verification and eventual removal of the old tunnel subscription.
18. **Embed setup:** checkpoint E documents creating the production link and inserting it with Notion `/embed`; no localhost replacement is required.
19. **Computer-off validation:** [ALWAYS_ON_VALIDATION.md](ALWAYS_ON_VALIDATION.md) is the pending release gate, including stopping local processes/tunnel, a real edit, next-day use and hosted restart persistence.
20. **Validation:** baseline lint/typecheck/build and 34 tests passed; one baseline browser navigation hit a transient Windows network-buffer error and passed on retry. Production-specific coverage adds environment validation, auth/CSRF/cookies, encrypted verification capture, durable fixture webhook/property/embed flow, storage failure and migration rollback/checksum checks. Final command results are recorded below after the final pass.
21. **Limits:** no provider account connection or public production URL yet; no live hosted delivery or computer-off proof. One internal integration, one worker, global process-local login throttling, no public OAuth/recovery/account system, no new-scene enrollment, no transfer of local history and no new analytics. Paid PostgreSQL recovery plus periodic secure exports are documented. Full audit retains four moderate development-only Drizzle generation-tool findings; production dependency audit reports zero vulnerabilities.
22. **Next milestone:** first pass the production/computer-off gate; then implement public Notion OAuth and onboarding with workspace ownership and encrypted credential storage. The internal credential source and client creation remain explicit seams rather than a completed multi-user system.

## Final verification

- `npm install`: baseline completed; targeted patched dependency updates applied without a force-fix.
- `npm run lint`: passed.
- `npm run typecheck`: passed.
- `npm test`: 43 passed; the dedicated native PostgreSQL test is skipped locally and runs against PostgreSQL 18 in CI (44 total).
- `npm run build`: all four workspaces passed.
- `npm run e2e`: all three Chromium checks passed (existing demo flow, persistent configuration/automatic progress/revocable narrow embed, hosted login/logout UI).
- `npm audit --omit=dev`: zero vulnerabilities. Full audit: four moderate development-only generation-tool findings, zero high/critical.
- `render.yaml`: structurally validated against Render's current public JSON schema without accessing an account or provisioning resources.
- `git diff --check`: clean.
- GitHub CI: pending publication/run; record its actual result after the run.
- Public URLs, paid account setup, real hosted Notion delivery/property write-back and the computer-off gate: **pending**, not passed.
