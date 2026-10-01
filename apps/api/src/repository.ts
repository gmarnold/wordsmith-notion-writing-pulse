import { desc, eq, inArray } from "drizzle-orm";
import type { CreateManuscriptRequest, Manuscript, Stats, SyncRun } from "@wordsmith/shared";
import type { Db } from "./db/client.js";
import { manuscripts, manuscriptSources, syncRuns, wordCountSnapshots } from "./db/schema.js";

export interface Repository {
  createManuscript(input: CreateManuscriptRequest): Promise<Manuscript>;
  getManuscript(id: string): Promise<Manuscript | null>;
  listManuscripts(): Promise<Manuscript[]>;
  createSyncRun(manuscriptId: string): Promise<SyncRun>;
  completeSyncRun(id: string, status: SyncRun["status"], errorSummary?: string): Promise<void>;
  saveSnapshot(input: { syncRunId: string; manuscriptId: string; sourceId: string; wordCount: number }): Promise<void>;
  getStats(manuscriptId: string): Promise<Stats | null>;
}

type SnapshotRow = {
  syncRunId: string;
  manuscriptId: string;
  sourceId: string;
  wordCount: number;
  capturedAt: Date;
};

export class DrizzleRepository implements Repository {
  constructor(private readonly db: Db) {}

  async createManuscript(input: CreateManuscriptRequest): Promise<Manuscript> {
    const manuscriptId = crypto.randomUUID();
    const now = new Date();
    await this.db.insert(manuscripts).values({
      id: manuscriptId,
      name: input.name,
      notionRootId: input.notionRootId,
      notionRootType: input.notionRootType,
      createdAt: now,
      updatedAt: now
    });
    await this.db.insert(manuscriptSources).values(
      input.sources.map((source) => ({
        id: crypto.randomUUID(),
        manuscriptId,
        notionPageId: source.notionPageId,
        title: source.title,
        included: source.included,
        sortOrder: source.sortOrder,
        createdAt: now,
        updatedAt: now
      }))
    );
    return (await this.getManuscript(manuscriptId))!;
  }

  async getManuscript(id: string): Promise<Manuscript | null> {
    const rows = await this.db.select().from(manuscripts).where(eq(manuscripts.id, id));
    const manuscript = rows[0];
    if (!manuscript) return null;
    const sources = await this.db.select().from(manuscriptSources).where(eq(manuscriptSources.manuscriptId, id));
    return mapManuscript(manuscript, sources);
  }

  async listManuscripts(): Promise<Manuscript[]> {
    const rows = await this.db.select().from(manuscripts).orderBy(desc(manuscripts.createdAt));
    const ids = rows.map((row) => row.id);
    const sources = ids.length > 0 ? await this.db.select().from(manuscriptSources).where(inArray(manuscriptSources.manuscriptId, ids)) : [];
    return rows.map((row) => mapManuscript(row, sources.filter((source) => source.manuscriptId === row.id)));
  }

  async createSyncRun(manuscriptId: string): Promise<SyncRun> {
    const id = crypto.randomUUID();
    const startedAt = new Date();
    await this.db.insert(syncRuns).values({ id, manuscriptId, startedAt, status: "running" });
    return { id, manuscriptId, startedAt: startedAt.toISOString(), completedAt: null, status: "running", errorSummary: null };
  }

  async completeSyncRun(id: string, status: SyncRun["status"], errorSummary?: string): Promise<void> {
    await this.db.update(syncRuns).set({ status, completedAt: new Date(), errorSummary: errorSummary ?? null }).where(eq(syncRuns.id, id));
  }

  async saveSnapshot(input: { syncRunId: string; manuscriptId: string; sourceId: string; wordCount: number }): Promise<void> {
    await this.db.insert(wordCountSnapshots).values({ id: crypto.randomUUID(), ...input, capturedAt: new Date() });
  }

  async getStats(manuscriptId: string): Promise<Stats | null> {
    const manuscript = await this.getManuscript(manuscriptId);
    if (!manuscript) return null;
    const snapshots = await this.db.select().from(wordCountSnapshots).where(eq(wordCountSnapshots.manuscriptId, manuscriptId)).orderBy(desc(wordCountSnapshots.capturedAt));
    return buildStats(manuscript, snapshots);
  }
}

export class MemoryRepository implements Repository {
  private readonly manuscripts = new Map<string, Manuscript>();
  private readonly syncRuns = new Map<string, SyncRun>();
  private readonly snapshots: SnapshotRow[] = [];

  async createManuscript(input: CreateManuscriptRequest): Promise<Manuscript> {
    const now = new Date().toISOString();
    const id = crypto.randomUUID();
    const manuscript: Manuscript = {
      id,
      name: input.name,
      notionRootId: input.notionRootId,
      notionRootType: input.notionRootType,
      createdAt: now,
      updatedAt: now,
      sources: input.sources.map((source) => ({
        id: crypto.randomUUID(),
        manuscriptId: id,
        notionPageId: source.notionPageId,
        title: source.title,
        included: source.included,
        sortOrder: source.sortOrder
      }))
    };
    this.manuscripts.set(id, manuscript);
    return manuscript;
  }

  async getManuscript(id: string): Promise<Manuscript | null> {
    return this.manuscripts.get(id) ?? null;
  }

  async listManuscripts(): Promise<Manuscript[]> {
    return [...this.manuscripts.values()];
  }

  async createSyncRun(manuscriptId: string): Promise<SyncRun> {
    const run: SyncRun = { id: crypto.randomUUID(), manuscriptId, startedAt: new Date().toISOString(), completedAt: null, status: "running", errorSummary: null };
    this.syncRuns.set(run.id, run);
    return run;
  }

  async completeSyncRun(id: string, status: SyncRun["status"], errorSummary?: string): Promise<void> {
    const run = this.syncRuns.get(id);
    if (run) this.syncRuns.set(id, { ...run, status, completedAt: new Date().toISOString(), errorSummary: errorSummary ?? null });
  }

  async saveSnapshot(input: { syncRunId: string; manuscriptId: string; sourceId: string; wordCount: number }): Promise<void> {
    this.snapshots.push({ ...input, capturedAt: new Date() });
  }

  async getStats(manuscriptId: string): Promise<Stats | null> {
    const manuscript = await this.getManuscript(manuscriptId);
    if (!manuscript) return null;
    return buildStats(manuscript, this.snapshots.filter((snapshot) => snapshot.manuscriptId === manuscriptId));
  }
}

function mapManuscript(manuscript: typeof manuscripts.$inferSelect, sources: Array<typeof manuscriptSources.$inferSelect>): Manuscript {
  return {
    id: manuscript.id,
    name: manuscript.name,
    notionRootId: manuscript.notionRootId,
    notionRootType: manuscript.notionRootType === "database" ? "database" : "page",
    createdAt: manuscript.createdAt.toISOString(),
    updatedAt: manuscript.updatedAt.toISOString(),
    sources: sources.sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)).map((source) => ({
      id: source.id,
      manuscriptId: source.manuscriptId,
      notionPageId: source.notionPageId,
      title: source.title,
      included: source.included,
      sortOrder: source.sortOrder
    }))
  };
}

function buildStats(manuscript: Manuscript, snapshots: SnapshotRow[]): Stats {
  const byRun = new Map<string, SnapshotRow[]>();
  for (const snapshot of snapshots) byRun.set(snapshot.syncRunId, [...(byRun.get(snapshot.syncRunId) ?? []), snapshot]);
  const runs = [...byRun.entries()].map(([syncRunId, runSnapshots]) => ({
    syncRunId,
    capturedAt: latest(runSnapshots.map((snapshot) => snapshot.capturedAt)),
    totalWords: runSnapshots.reduce((sum, snapshot) => sum + snapshot.wordCount, 0),
    snapshots: runSnapshots
  })).sort((a, b) => b.capturedAt.getTime() - a.capturedAt.getTime());

  const latestRun = runs[0];
  const previousRun = runs[1];
  const chapters = latestRun?.snapshots.map((snapshot) => ({
    sourceId: snapshot.sourceId,
    title: manuscript.sources.find((source) => source.id === snapshot.sourceId)?.title ?? "Untitled page",
    wordCount: snapshot.wordCount
  })) ?? [];

  return {
    manuscriptId: manuscript.id,
    manuscriptName: manuscript.name,
    totalWords: latestRun?.totalWords ?? 0,
    previousTotalWords: previousRun?.totalWords ?? null,
    deltaSincePreviousSync: latestRun && previousRun ? latestRun.totalWords - previousRun.totalWords : null,
    netWordsToday: periodDelta(runs, "day"),
    netChangeThisWeek: periodDelta(runs, "week"),
    netChangeThisMonth: periodDelta(runs, "month"),
    lastSyncedAt: latestRun?.capturedAt.toISOString() ?? null,
    chapters,
    recentSyncs: runs.slice(0, 10).map((run, index) => ({
      syncRunId: run.syncRunId,
      capturedAt: run.capturedAt.toISOString(),
      totalWords: run.totalWords,
      delta: runs[index + 1] ? run.totalWords - runs[index + 1]!.totalWords : null
    }))
  };
}

function latest(dates: Date[]): Date {
  return new Date(Math.max(...dates.map((date) => date.getTime())));
}

function periodDelta(runs: Array<{ capturedAt: Date; totalWords: number }>, period: "day" | "week" | "month"): number {
  if (runs.length < 2) return 0;
  const now = new Date();
  const start = new Date(now);
  if (period === "day") start.setHours(0, 0, 0, 0);
  if (period === "week") {
    start.setDate(start.getDate() - start.getDay());
    start.setHours(0, 0, 0, 0);
  }
  if (period === "month") {
    start.setDate(1);
    start.setHours(0, 0, 0, 0);
  }
  const latestRun = runs[0]!;
  const baseline = runs.find((run) => run.capturedAt < start) ?? runs[runs.length - 1]!;
  return latestRun.totalWords - baseline.totalWords;
}
