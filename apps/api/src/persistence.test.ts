import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { expect, it } from "vitest";
import { FixtureNotionClient } from "@wordsmith/notion";
import { DrizzleRepository } from "./repository.js";
import type { Db } from "./db/client.js";
import * as schema from "./db/schema.js";
import { SyncStore } from "./syncStore.js";
import { createSyncEngine } from "./syncEngine.js";
import { defaultSettings } from "./analytics.js";
it("migrates existing PostgreSQL history and persists inbox, settings, snapshots and revocable access across engine restarts", async () => {
  const pg = new PGlite();
  try {
    const initial = await readFile(new URL("../drizzle/0000_initial.sql", import.meta.url), "utf8");
    const next = await readFile(
      new URL("../drizzle/0001_sync_foundation.sql", import.meta.url),
      "utf8",
    );
    await pg.exec(initial);
    const db = drizzle(pg, { schema }) as unknown as Db;
    const repo = new DrizzleRepository(db);
    const client = new FixtureNotionClient();
    const pageId = "22222222-2222-4222-8222-222222222222";
    const m = await repo.createManuscript({
      name: "Persistent novel",
      notionRootId: "11111111-1111-4111-8111-111111111111",
      notionRootType: "database",
      sources: [{ notionPageId: pageId, title: "Scene", included: true, sortOrder: 0 }],
    });
    const run = await repo.createSyncRun(m.id);
    await repo.saveSnapshot({
      syncRunId: run.id,
      manuscriptId: m.id,
      sourceId: m.sources[0]!.id,
      wordCount: 1000,
    });
    await repo.completeSyncRun(run.id, "success");
    await pg.exec(next);
    await pg.exec(next);
    const store = new SyncStore(db);
    const engine = createSyncEngine(repo, client, store);
    await engine.settings(m.id, {
      ...defaultSettings,
      timezone: "America/Chicago",
      wordCountPropertyId: "wc",
    });
    const link = (await engine.enableEmbed(m.id))!;
    expect(await store.enqueue("durable-event", pageId, new Date(Date.now() - 10000))).toBe(true);
    const restartedStore = new SyncStore(db);
    const restarted = createSyncEngine(new DrizzleRepository(db), client, restartedStore);
    expect(await restartedStore.enqueue("durable-event", pageId)).toBe(false);
    expect((await restarted.settings(m.id))?.timezone).toBe("America/Chicago");
    expect((await restarted.embed(link.token))?.totalWords).toBe(1000);
    client.setWordCount(pageId, 1100);
    await restarted.process();
    expect((await restarted.stats(m.id))?.totalWords).toBe(1100);
    expect((await restarted.stats(m.id))?.netWordsToday).toBe(100);
    expect(await repo.getSnapshots(m.id)).toHaveLength(2);
    await restarted.process();
    expect(await repo.getSnapshots(m.id)).toHaveLength(2);
    expect(await restartedStore.pending()).toHaveLength(0);
    await restarted.revokeEmbed(m.id);
    expect(await engine.embed(link.token)).toBeNull();
  } finally {
    await pg.close();
  }
}, 20000);
