# Notion setup

This prototype uses a private internal Notion connection for my own workspace. Later, Wordsmith can add public OAuth so other writers can authorize selected pages from their own workspaces.

## Create the connection

1. Go to `https://www.notion.so/my-integrations`.
2. Select **New integration**.
3. Name it `Wordsmith Dev`.
4. Choose the workspace that contains the writing project.
5. Keep it as an internal integration.
6. Grant read access to content. Wordsmith does not need write access for this prototype.
7. Save the integration.
8. Copy the internal integration secret.

## Put the token local only

Create `apps/api/.env` from the example file:

```bash
cp apps/api/.env.example apps/api/.env
```

Set:

```bash
NOTION_TOKEN=paste_token_here
WORDSMITH_DEMO_MODE=false
DATABASE_URL=postgresql://wordsmith:wordsmith@localhost:5432/wordsmith
API_PORT=4141
WEB_ORIGIN=http://localhost:5173
```

Never commit `apps/api/.env`, `.env`, or a real token.

## Share a page or database with Wordsmith

1. Open the Notion parent page or database that contains the writing pages.
2. Use the Notion share menu.
3. Choose **Add connections**.
4. Select `Wordsmith Dev`.
5. Confirm access.

Sharing a parent page may make descendant pages accessible to the integration. Use a dedicated writing parent or test page if you want to keep the initial access narrow.

## Start and verify

```bash
docker compose up -d
npm run db:migrate
npm run dev
```

Open `http://localhost:5173`. The status pill should change from demo or not configured to connected. Paste a Notion page or database URL and choose **Inspect manuscript**. If Wordsmith is connected but the page was not shared with the connection, the API will report that the page is inaccessible rather than asking for a new token.

## Disconnect

To disconnect Wordsmith from Notion, remove `Wordsmith Dev` from the shared page or database in Notion. To disable the local app, remove `NOTION_TOKEN` from `apps/api/.env` or delete the integration from the Notion developer portal.

