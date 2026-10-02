import { desc, eq, inArray } from "drizzle-orm";
import type { CreateManuscriptRequest, Manuscript, Stats, SyncRun } from "@wordsmith/shared";
import { buildStats, type SnapshotRow } from "./analytics.js";
import type { Db } from "./db/client.js";
import { manuscripts, manuscriptSources, syncRuns, wordCountSnapshots } from "./db/schema.js";

export interface Repository {
  createManuscript(input: CreateManuscriptRequest): Promise<Manuscript>;
  getManuscript(id: string): Promise<Manuscript | null>;
  listManuscripts(): Promise<Manuscript[]>;
  createSyncRun(manuscriptId: string): Promise<SyncRun>;
  completeSyncRun(id: string, status: SyncRun["status"], errorSummary?: string): Promise<void>;
  saveSnapshot(input: {
    syncRunId: string;
    manuscriptId: string;
    sourceId: string;
    wordCount: number;
  }): Promise<void>;
  getStats(manuscriptId: string): Promise<Stats | null>;
  getSnapshots(manuscriptId: string): Promise<SnapshotRow[]>;
  getSyncRuns(manuscriptId: string): Promise<SyncRun[]>;
}

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
      updatedAt: now,
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
        updatedAt: now,
      })),
    );
    return (await this.getManuscript(manuscriptId))!;
  }

  async getManuscript(id: string): Promise<Manuscript | null> {
    const rows = await this.db.select().from(manuscripts).where(eq(manuscripts.id, id));
    const manuscript = rows[0];
    if (!manuscript) return null;
    const sources = await this.db
      .select()
      .from(manuscriptSources)
      .where(eq(manuscriptSources.manuscriptId, id));
    return mapManuscript(manuscript, sources);
  }

  async listManuscripts(): Promise<Manuscript[]> {
    const rows = await this.db.select().from(manuscripts).orderBy(desc(manuscripts.createdAt));
    const ids = rows.map((row) => row.id);
    const sources =
      ids.length > 0
        ? await this.db
            .select()
            .from(manuscriptSources)
            .where(inArray(manuscriptSources.manuscriptId, ids))
        : [];
    return rows.map((row) =>
      mapManuscript(
        row,
        sources.filter((source) => source.manuscriptId === row.id),
      ),
    );
  }

  async createSyncRun(manuscriptId: string): Promise<SyncRun> {
    const id = crypto.randomUUID();
    const startedAt = new Date();
    await this.db.insert(syncRuns).values({ id, manuscriptId, startedAt, status: "running" });
    return {
      id,
      manuscriptId,
      startedAt: startedAt.toISOString(),
      completedAt: null,
      status: "running",
      errorSummary: null,
    };
  }

  async completeSyncRun(
    id: string,
    status: SyncRun["status"],
    errorSummary?: string,
  ): Promise<void> {
    await this.db
      .update(syncRuns)
      .set({ status, completedAt: new Date(), errorSummary: errorSummary ?? null })
      .where(eq(syncRuns.id, id));
  }

  async saveSnapshot(input: {
    syncRunId: string;
    manuscriptId: string;
    sourceId: string;
    wordCount: number;
  }): Promise<void> {
    await this.db
      .insert(wordCountSnapshots)
      .values({ id: crypto.randomUUID(), ...input, capturedAt: new Date() });
  }

  async getSyncRuns(manuscriptId: string): Promise<SyncRun[]> {
    const rows = await this.db
      .select()
      .from(syncRuns)
      .where(eq(syncRuns.manuscriptId, manuscriptId))
      .orderBy(desc(syncRuns.startedAt))
      .limit(10);
    return rows.map((r) => ({
      ...r,
      status: r.status as SyncRun["status"],
      startedAt: r.startedAt.toISOString(),
      completedAt: r.completedAt?.toISOString() ?? null,
    }));
  }

  async getSnapshots(manuscriptId: string): Promise<SnapshotRow[]> {
    return this.db
      .select()
      .from(wordCountSnapshots)
      .where(eq(wordCountSnapshots.manuscriptId, manuscriptId))
      .orderBy(wordCountSnapshots.capturedAt);
  }

  async getStats(manuscriptId: string): Promise<Stats | null> {
    const manuscript = await this.getManuscript(manuscriptId);
    if (!manuscript) return null;
    const snapshots = await this.db
      .select()
      .from(wordCountSnapshots)
      .where(eq(wordCountSnapshots.manuscriptId, manuscriptId))
      .orderBy(desc(wordCountSnapshots.capturedAt));
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
        sortOrder: source.sortOrder,
      })),
    };
    this.manuscripts.set(id, manuscript);
    return manuscript;
  }

  async getManuscript(id: string): Promise<Manuscript | null> {
    return this.manuscripts.get(id) ?? null;
  }

  async listManuscripts(): Promise<Manuscript[]> {
    return [...this.manuscripts.values()].reverse();
  }

  async createSyncRun(manuscriptId: string): Promise<SyncRun> {
    const run: SyncRun = {
      id: crypto.randomUUID(),
      manuscriptId,
      startedAt: new Date().toISOString(),
      completedAt: null,
      status: "running",
      errorSummary: null,
    };
    this.syncRuns.set(run.id, run);
    return run;
  }

  async completeSyncRun(
    id: string,
    status: SyncRun["status"],
    errorSummary?: string,
  ): Promise<void> {
    const run = this.syncRuns.get(id);
    if (run)
      this.syncRuns.set(id, {
        ...run,
        status,
        completedAt: new Date().toISOString(),
        errorSummary: errorSummary ?? null,
      });
  }

  async saveSnapshot(input: {
    syncRunId: string;
    manuscriptId: string;
    sourceId: string;
    wordCount: number;
  }): Promise<void> {
    this.snapshots.push({ ...input, capturedAt: new Date() });
  }

  async getSyncRuns(manuscriptId: string): Promise<SyncRun[]> {
    return [...this.syncRuns.values()]
      .filter((r) => r.manuscriptId === manuscriptId)
      .reverse()
      .slice(0, 10);
  }

  async getSnapshots(manuscriptId: string): Promise<SnapshotRow[]> {
    return this.snapshots.filter((s) => s.manuscriptId === manuscriptId);
  }

  async getStats(manuscriptId: string): Promise<Stats | null> {
    const manuscript = await this.getManuscript(manuscriptId);
    if (!manuscript) return null;
    return buildStats(
      manuscript,
      this.snapshots.filter((snapshot) => snapshot.manuscriptId === manuscriptId),
    );
  }
}

function mapManuscript(
  manuscript: typeof manuscripts.$inferSelect,
  sources: Array<typeof manuscriptSources.$inferSelect>,
): Manuscript {
  return {
    id: manuscript.id,
    name: manuscript.name,
    notionRootId: manuscript.notionRootId,
    notionRootType: manuscript.notionRootType === "database" ? "database" : "page",
    createdAt: manuscript.createdAt.toISOString(),
    updatedAt: manuscript.updatedAt.toISOString(),
    sources: sources
      .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0))
      .map((source) => ({
        id: source.id,
        manuscriptId: source.manuscriptId,
        notionPageId: source.notionPageId,
        title: source.title,
        included: source.included,
        sortOrder: source.sortOrder,
      })),
  };
}
