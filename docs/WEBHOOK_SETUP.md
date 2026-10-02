# Local webhook setup

This guide is for **local development**. It requires the computer, local API and temporary tunnel to stay running. For the hosted, computer-off workflow use [PRODUCTION_DEPLOYMENT.md](PRODUCTION_DEPLOYMENT.md). Cloudflare Tunnel is not required or used in production.

Wordsmith automatically updates shortly after you edit your writing. Notion batches `page.content_updated` events; allow a minute or two for delivery, then approximately three seconds for Wordsmith's debounce and up to 15 seconds for dashboard refresh. This is not a keystroke feed.

## Before the external checkpoint

1. Start PostgreSQL. A native Windows installation works without Docker; see [POSTGRESQL_SETUP.md](POSTGRESQL_SETUP.md). If using Docker, start Docker Desktop and run `docker compose up -d` from the repository root. Keep your existing database/history if already configured.
2. Run `npm install` and `npm run build` (the public embed serves the built web assets).
3. In `apps/api/.env`, keep your existing `NOTION_TOKEN` and `DATABASE_URL`, set `WORDSMITH_DEMO_MODE=false`, and temporarily set `NOTION_WEBHOOK_SETUP=true`. Leave `NOTION_WEBHOOK_VERIFICATION_TOKEN=` empty. Put secrets directly in this file; never paste them into chat.
4. Run `npm run db:migrate`. This adds the inbox/settings tables without replacing your manuscript history. The migration runner records applied SQL files and recognizes an existing first-iteration schema.
5. Run `npm run dev:api` in one terminal and `npm run dev:web` in another. API configuration is at `http://localhost:4141`; the web app is at `http://localhost:5173`. The API also starts a separate public-only listener at **4142**. Both listeners bind to loopback.
6. In the web app, inspect the actual Scenes database, name your manuscript, select included pages and sync. For a previously saved manuscript, the most recent manuscript is restored when you reload; avoid creating another tracking record unnecessarily.
7. In Notion, add a **Number** property (for example, `Word Count`) and optionally a **Date** property (for example, `Last Counted`). Reload Wordsmith, select these properties, set your timezone (for example, `America/Chicago`) and goals, save settings, then Sync now. Your Notion connection needs read and update content capabilities and access to the database and scenes. Standalone pages can be counted, but database property write-back requires database entries.

A portfolio development server was using port 5173 during validation. To keep that server running, set `WEB_ORIGIN=http://localhost:5174` in `apps/api/.env`, then start the web app in its own PowerShell terminal with:

```powershell
$env:WEB_PORT="5174"
npm run dev:web
```

Use `http://localhost:5174` for Wordsmith. The API and public tunnel ports stay 4141 and 4142. Vite now fails clearly on an occupied port rather than silently changing ports.

## External checkpoint: complete these steps yourself

Neither `cloudflared` nor `ngrok` was found during the local tool audit. Cloudflare Quick Tunnels are a straightforward temporary option without a paid subscription. Install `cloudflared` using the [official installation instructions](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) or, on Windows, `winget install --id Cloudflare.cloudflared`.

1. Keep the API and web app running. In a third terminal run:

   ```powershell
   cloudflared tunnel --url http://localhost:4142
   ```

   Alternatively use `ngrok http 4142` if you already have ngrok configured. Tunnel **4142**, which exposes only webhooks, read-only embeds and built assets. Do not tunnel the configuration API on 4141 or the Vite development server on 5173.

2. Copy the generated HTTPS hostname, such as `https://example.trycloudflare.com`. The exact webhook URL is:

   ```text
   https://YOUR-TUNNEL-HOST/api/webhooks/notion
   ```

3. Open your Notion connection's developer settings, select **Webhooks → Create a subscription**, paste that URL, and select **page.content_updated**. No property-update event subscription is needed for this slice.
4. Create the subscription. Notion sends an unsigned verification-token handshake. While setup mode is enabled and no verification token is configured, Wordsmith writes the token once to **apps/api/.webhook-verification-token**, an ignored local file. It does not print the token, return it to the browser, or apply manuscript changes. On Windows, this file inherits local filesystem ACLs; keep it private. If the file already exists, the capture returns 409. Remove that exact file locally before deliberately resending a token.
5. Open that file locally. In Notion's subscription verification dialog, paste its contents and verify the subscription. The token originates in Notion's POST; it is not a secret displayed in the Wordsmith UI. Do not send it to Codex.
6. Put the same value into `apps/api/.env` as:

   ```dotenv
   NOTION_WEBHOOK_VERIFICATION_TOKEN=YOUR_VALUE_FROM_THE_LOCAL_FILE
   NOTION_WEBHOOK_SETUP=false
   ```

   Restart `npm run dev:api` after saving `.env`. Delete the local token capture file when you have safely configured the environment. The application does not automatically load that file as a secret.

7. Edit prose in **one included scene**. Add a short distinctive sentence, then wait a minute or two for Notion's aggregated event. There is no need to reload the entire Notion page to refresh the embed.
8. Confirm all of these observations:
   - Wordsmith's configuration panel says **Webhook verification configured** (this means the token is configured; actual delivery is proved by the next checks).
   - The API worker logs `Automatic scene sync` with `status: "success"` and the affected page ID. No prose or token is logged. `retry_pending` means counting or write-back failed and the inbox will retry in 30 seconds.
   - Latest sync status becomes `success`; a failure summary points to access/property mapping checks. The queue returns to zero.
   - The edited scene's Number property changes; the dashboard total and Today Net change by the observed count delta. Changing just a property does not start another recount cycle.
   - The embed reflects the derived stats on its next 15-second refresh.
9. Tell me setup is complete and describe any non-secret error/status. I will continue real integration testing then. Do not paste `.env`, Notion tokens, or private embed links into chat.

A Quick Tunnel URL changes when the tunnel restarts. Notion's verified webhook URL cannot be edited in place: recreate the subscription for a changed URL and repeat the token setup. For regular use, deploy the public-only listener behind a stable HTTPS hostname; keep configuration local/private. Run one Wordsmith API worker process in this iteration.

Official references: [Notion webhooks and verification](https://developers.notion.com/reference/webhooks), [event delivery](https://developers.notion.com/reference/webhooks-events-delivery), [Cloudflare Quick Tunnels](https://developers.cloudflare.com/tunnel/get-started/quick-tunnels/).
