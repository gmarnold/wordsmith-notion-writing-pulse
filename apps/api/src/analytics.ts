import type { Settings, Stats, Manuscript } from "@wordsmith/shared";
export type SnapshotRow = {
  syncRunId: string;
  manuscriptId: string;
  sourceId: string;
  wordCount: number;
  capturedAt: Date;
};
export const defaultSettings: Settings = {
  timezone: "UTC",
  goals: { DAILY: null, WEEKLY: null, MONTHLY: null, TOTAL: null },
  wordCountPropertyId: null,
  lastCountedPropertyId: null,
};
export function periodKey(date: Date, timezone: string, period: "day" | "week" | "month"): string {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: timezone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const part = (name: string) => parts.find((p) => p.type === name)!.value;
  const day = `${part("year")}-${part("month")}-${part("day")}`;
  if (period === "day") return day;
  if (period === "month") return day.slice(0, 7);
  const calendar = new Date(`${day}T12:00:00Z`);
  calendar.setUTCDate(calendar.getUTCDate() - ((calendar.getUTCDay() + 6) % 7));
  return calendar.toISOString().slice(0, 10);
}
export function buildStats(
  manuscript: Manuscript,
  snapshots: SnapshotRow[],
  settings = defaultSettings,
  now = new Date(),
): Stats {
  const included = new Set(manuscript.sources.filter((s) => s.included).map((s) => s.id));
  const ordered = snapshots
    .filter((s) => included.has(s.sourceId) && s.capturedAt <= now)
    .sort((a, b) => a.capturedAt.getTime() - b.capturedAt.getTime());
  const current = new Map<string, number>();
  const runs = new Map<
    string,
    { syncRunId: string; capturedAt: string; totalWords: number; delta: number | null }
  >();
  const deltas: { at: Date; value: number }[] = [];
  for (const s of ordered) {
    const previous = current.get(s.sourceId);
    const delta = previous === undefined ? 0 : s.wordCount - previous;
    deltas.push({ at: s.capturedAt, value: delta });
    current.set(s.sourceId, s.wordCount);
    const prior = runs.get(s.syncRunId);
    runs.set(s.syncRunId, {
      syncRunId: s.syncRunId,
      capturedAt: s.capturedAt.toISOString(),
      totalWords: [...current.values()].reduce((a, b) => a + b, 0),
      delta: (prior?.delta ?? 0) + delta,
    });
  }
  const recent = [...runs.values()].reverse();
  if (recent.length) recent[recent.length - 1]!.delta = null;
  const net = (period: "day" | "week" | "month") =>
    deltas
      .filter(
        (d) =>
          periodKey(d.at, settings.timezone, period) === periodKey(now, settings.timezone, period),
      )
      .reduce((sum, d) => sum + d.value, 0);
  return {
    timezone: settings.timezone,
    manuscriptId: manuscript.id,
    manuscriptName: manuscript.name,
    totalWords: [...current.values()].reduce((a, b) => a + b, 0),
    previousTotalWords: recent[1]?.totalWords ?? null,
    deltaSincePreviousSync: recent[0]?.delta ?? null,
    netWordsToday: net("day"),
    netChangeThisWeek: net("week"),
    netChangeThisMonth: net("month"),
    lastSyncedAt: recent[0]?.capturedAt ?? null,
    chapters: manuscript.sources
      .filter((s) => s.included)
      .map((s) => ({ sourceId: s.id, title: s.title, wordCount: current.get(s.id) ?? 0 })),
    recentSyncs: recent.slice(0, 10),
  };
}
export function observedChanges(snapshots: SnapshotRow[]) {
  const previous = new Map<string, number>();
  return [...snapshots]
    .sort((a, b) => +a.capturedAt - +b.capturedAt)
    .map((s) => {
      const delta = previous.has(s.sourceId) ? s.wordCount - previous.get(s.sourceId)! : 0;
      previous.set(s.sourceId, s.wordCount);
      return {
        capturedAt: s.capturedAt,
        delta,
        additions: Math.max(0, delta),
        removals: Math.max(0, -delta),
      };
    });
}
