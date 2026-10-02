import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { sql } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { signWebhookPayload } from "@notionhq/client";
import { FixtureNotionClient } from "@wordsmith/notion";
import { buildServer } from "./server.js";
import { parseConfig } from "./environment.js";
import { hashPassword } from "./adminAuth.js";
import type { Db } from "./db/client.js";
import * as schema from "./db/schema.js";
import type { SyncEngine } from "./syncEngine.js";
const origin = "https://wordsmith.example";
const password = "fixture-only-admin-password";
const token = "fixture-only-webhook-verification";
const csrf = { origin, "x-wordsmith-request": "1" };
async function fixture(setup = false) {
  const pg = new PGlite();
  for (const file of ["0000_initial.sql", "0001_sync_foundation.sql", "0002_hosted_admin.sql"])
    await pg.exec(await readFile(new URL("../drizzle/" + file, import.meta.url), "utf8"));
  const db = drizzle(pg, { schema }) as unknown as Db;
  const client = new FixtureNotionClient();
  const config = parseConfig({
    NODE_ENV: "production",
    DATABASE_URL: "postgresql://fixture:fixture@localhost/fixture",
    NOTION_TOKEN: "fixture-only-notion-token",
    PUBLIC_ORIGIN: origin,
    ADMIN_PASSWORD_HASH: await hashPassword(password),
    SESSION_SECRET: "fixture-only-session-secret-longer-than-32-characters",
    NOTION_WEBHOOK_SETUP: setup,
    NOTION_WEBHOOK_VERIFICATION_TOKEN: setup ? undefined : token,
  });
  const make = () => buildServer({ config, db, client, worker: false });
  const server = make();
  await server.ready();
  const login = await server.inject({
    method: "POST",
    url: "/api/auth/login",
    headers: csrf,
    payload: { password },
  });
  const cookie = String(login.headers["set-cookie"]).split(";")[0]!;
  return {
    pg,
    db,
    client,
    config,
    make,
    server,
    cookie,
    engine: (server as typeof server & { syncEngine: SyncEngine }).syncEngine,
  };
}
it("protects admin routes with secure revocable sessions, origin checks and login limits", async () => {
  const f = await fixture();
  try {
    const health = await f.server.inject("/api/health");
    expect(health.statusCode).toBe(200);
    expect(health.json()).toMatchObject({ database: "connected", notionConfigured: true });
    expect(health.body).not.toContain(f.config.NOTION_TOKEN);
    expect(health.body).not.toContain(f.config.DATABASE_URL);
    expect((await f.server.inject("/api/manuscripts")).statusCode).toBe(401);
    const page = await f.server.inject("/");
    expect(page.headers["x-frame-options"]).toBe("DENY");
    expect(page.body).not.toContain("fixture-only-notion-token");
    expect(
      (
        await f.server.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: csrf,
          payload: { password: "wrong" },
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (await f.server.inject({ method: "POST", url: "/api/auth/login", payload: { password } }))
        .statusCode,
    ).toBe(403);
    const logged = await f.server.inject({
      method: "POST",
      url: "/api/auth/login",
      headers: csrf,
      payload: { password },
    });
    expect(logged.headers["set-cookie"]).toContain("HttpOnly; Secure; SameSite=Strict");
    expect(logged.headers["set-cookie"]).toContain("__Host-wordsmith-session=");
    expect(
      (await f.server.inject({ url: "/api/manuscripts", headers: { cookie: f.cookie } }))
        .statusCode,
    ).toBe(200);
    expect(
      (
        await f.server.inject({
          method: "POST",
          url: "/api/manuscripts/inspect",
          headers: {
            cookie: f.cookie,
            origin: "https://attacker.example",
            "x-wordsmith-request": "1",
          },
          payload: { notionUrlOrId: "demo" },
        })
      ).statusCode,
    ).toBe(403);
    expect(
      (
        await f.server.inject({
          method: "POST",
          url: "/api/manuscripts/inspect",
          headers: { cookie: f.cookie, origin },
          payload: { notionUrlOrId: "demo" },
        })
      ).statusCode,
    ).toBe(403);
    await f.server.inject({
      method: "POST",
      url: "/api/auth/logout",
      headers: { ...csrf, cookie: f.cookie },
    });
    expect(
      (await f.server.inject({ url: "/api/manuscripts", headers: { cookie: f.cookie } }))
        .statusCode,
    ).toBe(401);
    for (let i = 0; i < 10; i++)
      await f.server.inject({
        method: "POST",
        url: "/api/auth/login",
        headers: csrf,
        payload: { password: "wrong" },
      });
    expect(
      (
        await f.server.inject({
          method: "POST",
          url: "/api/auth/login",
          headers: csrf,
          payload: { password },
        })
      ).statusCode,
    ).toBe(429);
  } finally {
    await f.server.close();
    await f.pg.close();
  }
}, 20000);

it("processes a signed hosted webhook, writes mapped values and retains goals/history/embed access across restart", async () => {
  const f = await fixture();
  let restarted: ReturnType<typeof buildServer> | undefined;
  try {
    const pageId = "22222222-2222-4222-8222-222222222222";
    const headers = { ...csrf, cookie: f.cookie };
    const created = await f.server.inject({
      method: "POST",
      url: "/api/manuscripts",
      headers,
      payload: {
        name: "Hosted fixture novel",
        notionRootId: "11111111-1111-4111-8111-111111111111",
        notionRootType: "database",
        sources: [{ notionPageId: pageId, title: "Synthetic scene", included: true, sortOrder: 0 }],
      },
    });
    expect(created.statusCode).toBe(200);
    const id = created.json().id;
    const settings = {
      timezone: "America/Chicago",
      goals: { DAILY: 500, WEEKLY: 2000, MONTHLY: 8000, TOTAL: 50000 },
      wordCountPropertyId: "wc",
      lastCountedPropertyId: "lc",
    };
    expect(
      (
        await f.server.inject({
          method: "PUT",
          url: "/api/manuscripts/" + id + "/settings",
          headers,
          payload: settings,
        })
      ).statusCode,
    ).toBe(200);
    f.client.setWordCount(pageId, 1000);
    await f.server.inject({ method: "POST", url: "/api/manuscripts/" + id + "/sync", headers });
    const embed = (
      await f.server.inject({ method: "POST", url: "/api/manuscripts/" + id + "/embed", headers })
    ).json();
    expect(embed.url).toBe(origin + "/embed/" + embed.token);
    f.client.setWordCount(pageId, 1100);
    const body = JSON.stringify({
      id: "hosted-fixture-event",
      type: "page.content_updated",
      entity: { id: pageId, type: "page" },
    });
    const send = async (signature?: string) =>
      f.server.inject({
        method: "POST",
        url: "/api/webhooks/notion",
        headers: {
          "content-type": "application/json",
          "x-notion-signature":
            signature ?? (await signWebhookPayload({ body, verificationToken: token })),
        },
        payload: body,
      });
    expect((await send("sha256=invalid")).statusCode).toBe(401);
    expect((await send()).json()).toEqual({ status: "queued" });
    expect((await send()).json()).toEqual({ status: "duplicate" });
    await f.db.execute(sql`UPDATE webhook_events SET available_at = now() - interval '10 seconds'`);
    await f.engine.process();
    expect((await f.client.retrievePage(pageId)).properties?.wc).toMatchObject({ number: 1100 });
    const stats = (await f.server.inject("/api/embed/" + embed.token)).json();
    expect(stats).toMatchObject({ totalWords: 1100, netWordsToday: 100, goals: settings.goals });
    expect(JSON.stringify(stats)).not.toContain(pageId);
    expect(
      (
        await f.server.inject({
          url: "/api/manuscripts",
          headers: { cookie: "__Host-wordsmith-session=" + embed.token },
        })
      ).statusCode,
    ).toBe(401);
    await f.server.close();
    restarted = f.make();
    await restarted.ready();
    expect((await restarted.inject("/api/embed/" + embed.token)).json()).toMatchObject({
      totalWords: 1100,
      goals: settings.goals,
    });
    expect(
      (
        await restarted.inject({
          url: "/api/manuscripts/" + id + "/settings",
          headers: { cookie: f.cookie },
        })
      ).json(),
    ).toEqual(settings);
    expect(
      (
        await restarted.inject({
          url: "/api/manuscripts/" + id + "/sync-status",
          headers: { cookie: f.cookie },
        })
      ).json(),
    ).toHaveLength(2);
    await restarted.inject({ method: "DELETE", url: "/api/manuscripts/" + id + "/embed", headers });
    expect((await restarted.inject("/api/embed/" + embed.token)).statusCode).toBe(404);
  } finally {
    await restarted?.close();
    await f.server.close();
    await f.pg.close();
  }
}, 20000);

it("captures verification only with a short-lived admin-created nonce, encrypted at rest", async () => {
  const f = await fixture(true);
  try {
    expect((await f.server.inject("/api/webhook/setup")).statusCode).toBe(401);
    const setup = (
      await f.server.inject({
        method: "POST",
        url: "/api/webhook/setup",
        headers: { ...csrf, cookie: f.cookie },
      })
    ).json();
    const payload = { verification_token: token };
    expect(
      (await f.server.inject({ method: "POST", url: "/api/webhooks/notion", payload })).statusCode,
    ).toBe(403);
    const path = new URL(setup.url).pathname + new URL(setup.url).search;
    expect((await f.server.inject({ method: "POST", url: path, payload })).statusCode).toBe(200);
    expect((await f.server.inject({ method: "POST", url: path, payload })).statusCode).toBe(403);
    expect(JSON.stringify(await f.pg.query("SELECT * FROM integration_state"))).not.toContain(
      token,
    );
    expect(
      (await f.server.inject({ url: "/api/webhook/setup", headers: { cookie: f.cookie } })).json()
        .token,
    ).toBe(token);
    expect(
      (
        await f.server.inject({
          url: "/api/webhook/setup",
          headers: { cookie: f.cookie, origin: "https://attacker.example" },
        })
      ).statusCode,
    ).toBe(403);
  } finally {
    await f.server.close();
    await f.pg.close();
  }
}, 20000);

it("returns unavailable when durable storage fails and does not acknowledge the event", async () => {
  const f = await fixture();
  try {
    vi.spyOn(f.engine, "receive").mockRejectedValue(new Error("private database details"));
    const body = JSON.stringify({
      id: "storage-failure-fixture",
      type: "page.content_updated",
      entity: { id: "22222222-2222-4222-8222-222222222222", type: "page" },
    });
    const response = await f.server.inject({
      method: "POST",
      url: "/api/webhooks/notion",
      headers: {
        "content-type": "application/json",
        "x-notion-signature": await signWebhookPayload({ body, verificationToken: token }),
      },
      payload: body,
    });
    expect(response.statusCode).toBe(503);
    expect(response.body).not.toContain("private database details");
    await f.pg.exec("DROP TABLE integration_state");
    expect((await f.server.inject("/api/health")).statusCode).toBe(503);
  } finally {
    await f.server.close();
    await f.pg.close();
  }
}, 20000);
