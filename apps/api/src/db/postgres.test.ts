import postgres from "postgres";
import { drizzle } from "drizzle-orm/postgres-js";
import { sql } from "drizzle-orm";
import { expect, it, vi } from "vitest";
import { FixtureNotionClient } from "@wordsmith/notion";
import { applyMigrations, loadMigrations } from "./migrations.js";
import { withDatabaseSyncLock } from "./syncLock.js";
import * as schema from "./schema.js";
import { DrizzleRepository } from "../repository.js";
import { createSyncEngine } from "../syncEngine.js";
import { SyncStore } from "../syncStore.js";
import { defaultSettings } from "../analytics.js";
const url = process.env.WORDSMITH_TEST_DATABASE_URL;

it.skipIf(!url)(
  "runs actual production migrations and serializes overlapping PostgreSQL workers without duplicate snapshots",
  async () => {
    if (process.env.NODE_ENV !== "test" || new URL(url!).pathname !== "/wordsmith_test")
      throw new Error("Use only the dedicated wordsmith_test database for this test.");
    const connection = postgres(url!, { max: 5, connect_timeout: 5 });
    const db = drizzle(connection, { schema });
    try {
      const migrations = await loadMigrations();
      for (let i = 0; i < 2; i++)
        await connection.begin((tx) =>
          applyMigrations(
            { query: async (text, parameters = []) => tx.unsafe(text, parameters) },
            migrations,
          ),
        );
      const repository = new DrizzleRepository(db);
      const client = new FixtureNotionClient();
      const pageId = "22222222-2222-4222-8222-222222222222";
      const manuscript = await repository.createManuscript({
        name: "Native PostgreSQL fixture",
        notionRootId: "11111111-1111-4111-8111-111111111111",
        notionRootType: "database",
        sources: [{ notionPageId: pageId, title: "Synthetic scene", included: true, sortOrder: 0 }],
      });
      const make = () =>
        createSyncEngine(repository, client, new SyncStore(db), {
          lock: (fn) => withDatabaseSyncLock(db, fn),
        });
      const first = make();
      const second = make();
      await first.settings(manuscript.id, {
        ...defaultSettings,
        wordCountPropertyId: "wc",
        goals: { ...defaultSettings.goals, DAILY: 500 },
      });
      client.setWordCount(pageId, 1000);
      await first.sync(manuscript.id);
      const writes = vi.spyOn(client, "updateProperties");
      client.setWordCount(pageId, 1100);
      await first.receive("native-fixture-" + crypto.randomUUID(), pageId);
      await db.execute(
        sql`UPDATE webhook_events SET available_at = now() - interval '10 seconds' WHERE status='pending'`,
      );
      await Promise.all([first.process(), second.process()]);
      expect(await repository.getSnapshots(manuscript.id)).toHaveLength(2);
      expect(writes).toHaveBeenCalledTimes(1);
      expect((await second.stats(manuscript.id))?.netWordsToday).toBe(100);
      expect((await second.settings(manuscript.id))?.goals.DAILY).toBe(500);
    } finally {
      await connection.end();
    }
  },
  20000,
);
