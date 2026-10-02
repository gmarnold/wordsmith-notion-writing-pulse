# Notion embed setup

For the hosted version, follow [production checkpoint E](PRODUCTION_DEPLOYMENT.md#checkpoint-e-production-embed). It generates the full permanent HTTPS URL. The localhost/tunnel instructions below remain for development only and require the development computer to stay running.

1. Build web assets with `npm run build` and run `npm run dev:api`. Run `npm run dev:web` for configuration.
2. In the Wordsmith web app, track/sync a manuscript, configure timezone and goals, and click Create embed link. The panel shows a compact iframe preview and a read-only URL of the form `http://localhost:4142/embed/OPAQUE_TOKEN`.
3. To test in Notion, expose the **public-only listener on 4142** via the HTTPS tunnel described in [WEBHOOK_SETUP.md](WEBHOOK_SETUP.md), or deploy it behind a stable HTTPS URL. Replace `http://localhost:4142` in the generated URL with that public HTTPS origin. Normal remote Notion embeds cannot reach your localhost.
4. Open the Notion project page. Above the Scenes database, type `/embed`, paste `https://YOUR-PUBLIC-HOST/embed/OPAQUE_TOKEN`, then select Embed link.
5. Resize the widget to suit the page; try about 500–700 pixels wide and 450–600 pixels tall. Narrow layouts stack metric cards. Drag the embed above Scenes. Optionally embed the same URL inside a scene for access to global progress there.
6. Edit an included scene after webhook setup. The embed polls Wordsmith's derived statistics every 15 seconds while visible. It never polls Notion or carries a Notion credential.
7. To revoke access, click Revoke embed in configuration. Creating a replacement link rotates access and immediately invalidates the previous link. Update Notion's embed URL after rotation.

The token has 256 bits of random entropy. Only its SHA-256 hash is stored in PostgreSQL; raw tokens appear once in the returned URL and are not recoverable from stored settings. The stats response omits manuscript/source IDs, scene titles, prose, sync error messages and credentials. It includes manuscript name, counts, goals, timezone and sync timestamp. Responses use no-store and no-referrer headers.

This is a bearer link: anyone with the complete URL can view the displayed derived stats. Keep it private. It is not user identity or full authentication. Notion and your HTTPS reverse proxy can see the URL; configure proxy access-log redaction for `/embed/*` and `/api/embed/*`. The public Fastify listener disables request logging. Revocation prevents future requests but cannot retract screenshots or already viewed data. A loaded widget clears stats when access fails on the next poll.

For hosting, expose only the listener on 4142 (embed HTML, built JS/CSS, stats and signed webhooks). Keep the configuration listener on 4141 local/private. Do not add frame-blocking `X-Frame-Options: DENY` headers at the proxy. Embed assets must be rebuilt after UI changes. A temporary tunnel stops working when your computer sleeps, restarts or the tunnel exits; use stable hosting for daily writing.
