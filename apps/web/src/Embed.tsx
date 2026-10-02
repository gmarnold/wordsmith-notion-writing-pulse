import type { Settings } from "@wordsmith/shared";
import { useEffect, useState } from "react";
import { api } from "./api";
import "./styles.css";
export type EmbedStats = {
  manuscriptName: string;
  totalWords: number;
  netWordsToday: number;
  netChangeThisWeek: number;
  netChangeThisMonth: number;
  sceneCount: number;
  lastSyncedAt: string | null;
  timezone: string;
  goals: Settings["goals"];
};
export function Embed() {
  const token = window.location.pathname.split("/")[2];
  const [stats, setStats] = useState<EmbedStats | null>(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let active = true;
    const load = () =>
      api<EmbedStats>(`/api/embed/${encodeURIComponent(token ?? "")}`)
        .then((s) => {
          if (active) {
            setStats(s);
            setError(false);
          }
        })
        .catch(() => {
          if (active) {
            setStats(null);
            setError(true);
          }
        });
    void load();
    const timer = setInterval(() => {
      if (!document.hidden) void load();
    }, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [token]);
  return (
    <main className="embedCard" aria-label="Wordsmith embedded dashboard">
      <p className="eyebrow">Wordsmith</p>
      {error ? (
        <p role="status">This dashboard is unavailable. Its link may have been revoked.</p>
      ) : stats ? (
        <EmbedDashboard stats={stats} />
      ) : (
        <p role="status">Loading writing progress…</p>
      )}
    </main>
  );
}
export function EmbedDashboard({ stats }: { stats: EmbedStats }) {
  const metrics: [string, number, number | null, boolean][] = [
    ["Today", stats.netWordsToday, stats.goals.DAILY, true],
    ["This week", stats.netChangeThisWeek, stats.goals.WEEKLY, true],
    ["This month", stats.netChangeThisMonth, stats.goals.MONTHLY, true],
    ["Manuscript goal", stats.totalWords, stats.goals.TOTAL, false],
  ];
  return (
    <>
      <h1>{stats.manuscriptName}</h1>
      <p className="embedTotal">
        <strong>{stats.totalWords.toLocaleString()}</strong> words
      </p>
      <div className="embedMetrics">
        {metrics.map(([label, value, goal, signed]) => (
          <div className="embedMetric" key={label}>
            <span>{label}</span>
            <strong>
              {signed && value >= 0 ? "+" : ""}
              {value.toLocaleString()}
              {goal ? ` / ${goal.toLocaleString()}` : ""}
            </strong>
            {goal ? (
              <>
                <progress
                  aria-label={`${label} goal progress`}
                  value={Math.max(0, value)}
                  max={goal}
                />
                <small>{Math.round((value / goal) * 100)}%</small>
              </>
            ) : null}
          </div>
        ))}
      </div>
      <p className="hint">
        {stats.sceneCount} scenes ·{" "}
        {stats.lastSyncedAt
          ? `Last sync: ${new Intl.DateTimeFormat(undefined, { timeZone: stats.timezone, hour: "numeric", minute: "2-digit" }).format(new Date(stats.lastSyncedAt))}`
          : "Waiting for first sync"}
      </p>
      <small>Automatically updates shortly after you edit your writing.</small>
    </>
  );
}
