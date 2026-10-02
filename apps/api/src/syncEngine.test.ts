import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { FixtureNotionClient } from "@wordsmith/notion";
import { MemoryRepository } from "./repository.js";
import { createSyncEngine } from "./syncEngine.js";
import {
  defaultSettings,
  buildStats,
  periodKey,
  observedChanges,
  type SnapshotRow,
} from "./analytics.js";
import { writeCount } from "./properties.js";
const pageA = "22222222-2222-4222-8222-222222222222";
const pageB = "33333333-3333-4333-8333-333333333333";
async function setup() {
  const repo = new MemoryRepository();
  const client = new FixtureNotionClient();
  const m = await repo.createManuscript({
    name: "Novel",
    notionRootId: "11111111-1111-4111-8111-111111111111",
    notionRootType: "database",
    sources: [pageA, pageB].map((notionPageId, i) => ({
      notionPageId,
      title: `Scene ${i}`,
      included: true,
      sortOrder: i,
    })),
  });
  const engine = createSyncEngine(repo, client);
  return { repo, client, m, engine };
}
beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-10-01T05:00:00Z"));
});
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});
describe("automatic recounts", () => {
  it("keeps absolute counts separate from daily net and goal progress", async () => {
    const { engine, client, m } = await setup();
    await engine.settings(m.id, {
      ...defaultSettings,
      timezone: "America/Chicago",
      goals: { ...defaultSettings.goals, DAILY: 500 },
      wordCountPropertyId: "wc",
    });
    client.setWordCount(pageA, 1000);
    client.setWordCount(pageB, 500);
    await engine.sync(m.id);
    expect((await engine.stats(m.id))?.netWordsToday).toBe(0);
    client.setWordCount(pageA, 1100);
    client.setWordCount(pageB, 600);
    await engine.receive("a", pageA);
    await engine.receive("b", pageB);
    vi.advanceTimersByTime(4000);
    await engine.process();
    const s = (await engine.stats(m.id))!;
    expect(s.totalWords).toBe(1700);
    expect(s.chapters.map((c) => c.wordCount)).toEqual([1100, 600]);
    expect(s.netWordsToday).toBe(200);
    expect((s.netWordsToday / 500) * 100).toBe(40);
    client.setWordCount(pageA, 1050);
    await engine.receive("c", pageA);
    vi.advanceTimersByTime(4000);
    await engine.process();
    expect((await engine.stats(m.id))?.netWordsToday).toBe(150);
    expect((150 / 500) * 100).toBe(30);
  });
  it("ignores untracked pages, deduplicates and debounces repeated events", async () => {
    const { engine, client, m, repo } = await setup();
    await engine.sync(m.id);
    expect(await engine.receive("outside", "99999999-9999-4999-8999-999999999999")).toEqual({
      status: "ignored",
    });
    client.setWordCount(pageA, 100);
    const read = vi.spyOn(client, "listBlockChildren");
    expect(await engine.receive("edit", pageA)).toEqual({ status: "queued" });
    expect(await engine.receive("edit", pageA)).toEqual({ status: "duplicate" });
    vi.advanceTimersByTime(2000);
    await engine.receive("edit-2", pageA);
    await engine.process();
    expect(read).not.toHaveBeenCalled();
    vi.advanceTimersByTime(4000);
    await engine.process();
    expect(read).toHaveBeenCalledTimes(1);
    const snapshots = await repo.getSnapshots(m.id);
    expect(snapshots).toHaveLength(3);
    await engine.process();
    expect(await repo.getSnapshots(m.id)).toHaveLength(3);
  });
  it("preserves history on API failure and safely retries", async () => {
    const { engine, client, m, repo } = await setup();
    await engine.sync(m.id);
    client.setWordCount(pageA, 200);
    vi.spyOn(client, "listBlockChildren").mockRejectedValueOnce(new Error("private response"));
    await engine.receive("failure", pageA);
    vi.advanceTimersByTime(4000);
    expect(await engine.process()).toEqual([{ pageId: pageA, status: "retry_pending" }]);
    expect(await repo.getSnapshots(m.id)).toHaveLength(2);
    vi.advanceTimersByTime(31000);
    await engine.process();
    expect(await repo.getSnapshots(m.id)).toHaveLength(3);
    expect(await engine.store.pending()).toHaveLength(0);
  });
  it("retries write-back without duplicating history, and stops property feedback loops", async () => {
    const { engine, client, m, repo } = await setup();
    await engine.settings(m.id, {
      ...defaultSettings,
      wordCountPropertyId: "wc",
      lastCountedPropertyId: "lc",
    });
    await engine.sync(m.id);
    const patch = vi.spyOn(client, "updateProperties");
    client.setWordCount(pageA, 200);
    patch.mockRejectedValueOnce(new Error("unavailable"));
    await engine.receive("changed", pageA);
    vi.advanceTimersByTime(4000);
    await engine.process();
    expect(await repo.getSnapshots(m.id)).toHaveLength(3);
    vi.advanceTimersByTime(31000);
    await engine.process();
    expect(await repo.getSnapshots(m.id)).toHaveLength(3);
    patch.mockClear();
    await engine.receive("own-write", pageA);
    vi.advanceTimersByTime(4000);
    await engine.process();
    expect(patch).not.toHaveBeenCalled();
    expect(await repo.getSnapshots(m.id)).toHaveLength(3);
  });
  it("baselines newly included existing pages", async () => {
    const { engine, m, repo } = await setup();
    await engine.sync(m.id);
    m.sources.push({
      id: "new",
      notionPageId: "44444444-4444-4444-8444-444444444444",
      title: "Old scene",
      included: true,
      sortOrder: 2,
    });
    await engine.sync(m.id);
    expect((await engine.stats(m.id))?.netWordsToday).toBe(0);
    expect(await repo.getSnapshots(m.id)).toHaveLength(5);
  });
});
describe("properties", () => {
  it("writes only changed mapped values, leaves other fields untouched, survives rename", async () => {
    const client = new FixtureNotionClient();
    vi.spyOn(client, "retrievePage").mockResolvedValue({
      id: pageA,
      object: "page",
      properties: {
        Renamed: { id: "stable", type: "number", number: 9 },
        Other: { id: "other", type: "number", number: 99 },
      },
    });
    const patch = vi.spyOn(client, "updateProperties");
    const settings = { ...defaultSettings, wordCountPropertyId: "stable" };
    await writeCount(client, pageA, 9, settings, new Date().toISOString());
    expect(patch).not.toHaveBeenCalled();
    await writeCount(client, pageA, 10, settings, new Date().toISOString());
    expect(patch).toHaveBeenCalledWith(pageA, { stable: { number: 10 } });
    await expect(
      writeCount(
        client,
        pageA,
        10,
        { ...settings, wordCountPropertyId: "missing" },
        new Date().toISOString(),
      ),
    ).rejects.toThrow("missing");
  });
});
describe("calendar semantics", () => {
  it.each([
    ["2026-03-08T07:59:00Z", "2026-03-08"],
    ["2026-03-08T08:01:00Z", "2026-03-08"],
    ["2026-11-01T06:30:00Z", "2026-11-01"],
    ["2026-11-01T07:30:00Z", "2026-11-01"],
    ["2026-10-01T04:59:00Z", "2026-09-30"],
    ["2026-10-01T05:00:00Z", "2026-10-01"],
  ])("uses Chicago day including DST %s", (date, key) =>
    expect(periodKey(new Date(date), "America/Chicago", "day")).toBe(key),
  );
  it("uses Monday weeks and calendar months in writer timezone", () => {
    expect(periodKey(new Date("2026-10-05T04:59:00Z"), "America/Chicago", "week")).toBe(
      "2026-09-28",
    );
    expect(periodKey(new Date("2026-10-05T05:00:00Z"), "America/Chicago", "week")).toBe(
      "2026-10-05",
    );
    expect(periodKey(new Date("2026-10-01T04:59:00Z"), "America/Chicago", "month")).toBe("2026-09");
  });
  it("assigns observed deltas to observation periods and never counts the first observation", async () => {
    const { m } = await setup();
    const sourceId = m.sources[0]!.id;
    const snapshots: SnapshotRow[] = [
      ["2026-09-30T04:00:00Z", 1000],
      ["2026-10-01T04:59:00Z", 1100],
      ["2026-10-01T05:01:00Z", 1050],
    ].map(([time, count], i) => ({
      sourceId,
      manuscriptId: m.id,
      syncRunId: String(i),
      capturedAt: new Date(time as string),
      wordCount: count as number,
    }));
    const s = buildStats(
      m,
      snapshots,
      { ...defaultSettings, timezone: "America/Chicago" },
      new Date("2026-10-01T06:00:00Z"),
    );
    expect(s.netWordsToday).toBe(-50);
    expect(s.netChangeThisMonth).toBe(-50);
    expect(s.netChangeThisWeek).toBe(50);
    expect(s.totalWords).toBe(1050);
    expect(observedChanges(snapshots).map((d) => [d.additions, d.removals])).toEqual([
      [0, 0],
      [100, 0],
      [0, 50],
    ]);
  });
});
describe("embed access", () => {
  it("returns derived stats only and rejects invalid, rotated and revoked links", async () => {
    const { engine, m } = await setup();
    await engine.sync(m.id);
    const first = (await engine.enableEmbed(m.id))!;
    const stats = await engine.embed(first.token);
    expect(stats?.sceneCount).toBe(2);
    expect(stats).not.toHaveProperty("chapters");
    expect(stats).not.toHaveProperty("notionPageId");
    expect(stats).not.toHaveProperty("manuscriptId");
    expect(stats).not.toHaveProperty("prose");
    expect(await engine.embed("invalid")).toBeNull();
    const second = (await engine.enableEmbed(m.id))!;
    expect(await engine.embed(first.token)).toBeNull();
    expect(await engine.embed(second.token)).not.toBeNull();
    await engine.revokeEmbed(m.id);
    expect(await engine.embed(second.token)).toBeNull();
  });
});
