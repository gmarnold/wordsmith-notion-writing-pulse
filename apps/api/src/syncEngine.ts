import { createHash, randomBytes } from "node:crypto";
import { countPageWords, normalizeNotionId } from "@wordsmith/notion";
import { settingsSchema } from "@wordsmith/shared";
import type { Repository } from "./repository.js";
import { buildStats } from "./analytics.js";
import { SyncStore } from "./syncStore.js";
import { writeCount, type WritingClient } from "./properties.js";
import { ApiProblem } from "./problems.js";
const hash = (token: string) => createHash("sha256").update(token).digest("hex");
export function createSyncEngine(
  repository: Repository,
  client: WritingClient,
  store = new SyncStore(),
) {
  let tail: Promise<unknown> = Promise.resolve();
  const serial = <T>(fn: () => Promise<T>): Promise<T> => {
    const next = tail.then(fn, fn);
    tail = next.catch(() => {});
    return next;
  };
  const stats = async (id: string) => {
    const m = await repository.getManuscript(id);
    return m ? buildStats(m, await repository.getSnapshots(id), await store.getSettings(id)) : null;
  };
  const recount = async (id: string, pageId?: string) => {
    const m = await repository.getManuscript(id);
    if (!m) return null;
    const run = await repository.createSyncRun(id);
    let errors = 0;
    const settings = await store.getSettings(id);
    const sources = m.sources.filter(
      (s) => s.included && (!pageId || normalizeNotionId(s.notionPageId) === pageId),
    );
    for (const source of sources) {
      try {
        const count = await countPageWords(client, source.notionPageId);
        const snapshots = (await repository.getSnapshots(id))
          .filter((s) => s.sourceId === source.id)
          .sort((a, b) => +b.capturedAt - +a.capturedAt);
        const previous = snapshots[0];
        if (!pageId || previous?.wordCount !== count)
          await repository.saveSnapshot({
            syncRunId: run.id,
            manuscriptId: id,
            sourceId: source.id,
            wordCount: count,
          });
        const latest = (await repository.getSnapshots(id))
          .filter((s) => s.sourceId === source.id)
          .sort((a, b) => +b.capturedAt - +a.capturedAt)[0]!;
        await writeCount(
          client,
          source.notionPageId,
          count,
          settings,
          latest.capturedAt.toISOString(),
        );
      } catch {
        errors++;
      }
    }
    await repository.completeSyncRun(
      run.id,
      errors ? (errors === sources.length ? "failed" : "partial_failure") : "success",
      errors
        ? "Could not recount or write mapped properties; check access and property mapping."
        : undefined,
    );
    if (errors && pageId) throw new Error("Automatic sync failed");
    return stats(id);
  };
  return {
    store,
    stats,
    sync: (id: string) => serial(() => recount(id)),
    async properties(id: string) {
      const m = await repository.getManuscript(id);
      if (!m) return null;
      if (m.notionRootType !== "database") return [];
      return client.listProperties(m.notionRootId);
    },
    async settings(id: string, raw?: unknown) {
      if (!(await repository.getManuscript(id))) return null;
      if (raw !== undefined) {
        const settings = settingsSchema.parse(raw);
        if (settings.wordCountPropertyId || settings.lastCountedPropertyId) {
          const m = (await repository.getManuscript(id))!;
          if (m.notionRootType !== "database")
            throw new ApiProblem(
              400,
              "PROPERTY_MAPPING",
              "Property write-back requires database entries.",
            );
          const properties = await client.listProperties(m.notionRootId);
          if (
            (settings.wordCountPropertyId &&
              !properties.some(
                (p) => p.id === settings.wordCountPropertyId && p.type === "number",
              )) ||
            (settings.lastCountedPropertyId &&
              !properties.some((p) => p.id === settings.lastCountedPropertyId && p.type === "date"))
          )
            throw new ApiProblem(
              400,
              "PROPERTY_MAPPING",
              "Select a Number property and optionally a Date property.",
            );
        }
        await store.saveSettings(id, settings);
      }
      return store.getSettings(id);
    },
    async receive(id: string, pageId: string) {
      const normalized = normalizeNotionId(pageId);
      const tracked = (await repository.listManuscripts()).some((m) =>
        m.sources.some((s) => s.included && normalizeNotionId(s.notionPageId) === normalized),
      );
      if (!tracked) return { status: "ignored" };
      return { status: (await store.enqueue(id, normalized)) ? "queued" : "duplicate" };
    },
    process: () =>
      serial(async () => {
        const processed: { pageId: string; status: string }[] = [];
        const events = await store.pending();
        const groups = new Map<string, typeof events>();
        for (const e of events) groups.set(e.pageId, [...(groups.get(e.pageId) ?? []), e]);
        for (const [pageId, group] of groups) {
          const now = new Date();
          if (group.some((e) => e.availableAt > now)) continue;
          try {
            for (const m of await repository.listManuscripts())
              if (m.sources.some((s) => s.included && normalizeNotionId(s.notionPageId) === pageId))
                await recount(m.id, pageId);
            await store.finish(
              group.map((e) => e.id),
              true,
            );
            processed.push({ pageId, status: "success" });
          } catch {
            await store.finish(
              group.map((e) => e.id),
              false,
            );
            processed.push({ pageId, status: "retry_pending" });
          }
        }
        await store.prune();
        return processed;
      }),
    async enableEmbed(id: string) {
      if (!(await repository.getManuscript(id))) return null;
      const token = randomBytes(32).toString("base64url");
      await store.setEmbed(id, hash(token));
      return { token };
    },
    async revokeEmbed(id: string) {
      await store.setEmbed(id, null);
    },
    async embed(token: string) {
      if (!/^[A-Za-z0-9_-]{43}$/.test(token)) return null;
      const id = await store.findEmbed(hash(token));
      if (!id) return null;
      const s = await stats(id);
      if (!s) return null;
      const settings = await store.getSettings(id);
      return {
        manuscriptName: s.manuscriptName,
        totalWords: s.totalWords,
        netWordsToday: s.netWordsToday,
        netChangeThisWeek: s.netChangeThisWeek,
        netChangeThisMonth: s.netChangeThisMonth,
        lastSyncedAt: s.lastSyncedAt,
        sceneCount: s.chapters.length,
        timezone: settings.timezone,
        goals: settings.goals,
      };
    },
  };
}
export type SyncEngine = ReturnType<typeof createSyncEngine>;
