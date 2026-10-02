import { BookOpen, Cloud, Database, RefreshCw, Sparkles } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Configuration } from "./Configuration";
import { api } from "./api";
import type { Stats } from "@wordsmith/shared";
import { createManuscript, getStatus, inspectManuscript, syncManuscript } from "./api";
import "./styles.css";

type Inspection = {
  name: string;
  notionRootId: string;
  notionRootType: "page" | "database";
  totalWords: number;
  sources: Array<{
    notionPageId: string;
    title: string;
    included: boolean;
    sortOrder: number | null;
    wordCount: number;
  }>;
};

export function App() {
  const [status, setStatus] = useState<Record<string, unknown> | null>(null);
  const [notionUrl, setNotionUrl] = useState("demo");
  const [inspection, setInspection] = useState<Inspection | null>(null);
  const [stats, setStats] = useState<Stats | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    api<Array<{ id: string }>>("/api/manuscripts")
      .then(async (manuscripts) => {
        const id = manuscripts[0]?.id;
        if (id) {
          setSavedId(id);
          setStats(await api<Stats>(`/api/manuscripts/${id}/stats`));
        }
      })
      .catch((error: Error) => setMessage(error.message));
    getStatus()
      .then(setStatus)
      .catch((error: Error) => setMessage(error.message));
  }, []);

  useEffect(() => {
    if (!savedId) return;
    const timer = setInterval(() => {
      api<Stats>(`/api/manuscripts/${savedId}/stats`)
        .then(setStats)
        .catch(() => {});
    }, 15000);
    return () => clearInterval(timer);
  }, [savedId]);

  const connectionLabel = useMemo(() => {
    if (!status) return "Checking";
    if (status.mode === "demo") return "Demo mode";
    return status.reachable ? "Connected" : "Not configured";
  }, [status]);

  async function inspect() {
    setBusy(true);
    setMessage(null);
    try {
      setInspection(await inspectManuscript(notionUrl));
      setStats(null);
      setSavedId(null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not inspect that manuscript.");
    } finally {
      setBusy(false);
    }
  }

  async function saveAndSync() {
    if (!inspection) return;
    if (savedId) {
      try {
        setStats(await syncManuscript(savedId));
      } catch (error) {
        setMessage(error instanceof Error ? error.message : "Could not sync.");
      }
      return;
    }
    setBusy(true);
    setMessage(null);
    try {
      const manuscript = await createManuscript({
        name: inspection.name,
        notionRootId: inspection.notionRootId,
        notionRootType: inspection.notionRootType,
        sources: inspection.sources.map((source) => ({
          notionPageId: source.notionPageId,
          title: source.title,
          included: source.included,
          sortOrder: source.sortOrder,
        })),
      });
      setSavedId(manuscript.id);
      setStats(await syncManuscript(manuscript.id));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not sync that manuscript.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <section className="masthead">
        <div>
          <p className="eyebrow">Wordsmith</p>
          <h1>Writing progress for Notion</h1>
        </div>
        <div className="statusPill" aria-label="Notion connection status">
          <Cloud size={18} />
          <span>{connectionLabel}</span>
        </div>
      </section>

      <section className="workspace">
        <div className="setupPanel">
          <div className="panelTitle">
            <BookOpen size={20} /> Connect a manuscript
          </div>
          <label htmlFor="notionUrl">Notion page or database URL</label>
          <div className="inspectRow">
            <input
              id="notionUrl"
              value={notionUrl}
              onChange={(event) => setNotionUrl(event.target.value)}
              placeholder="Paste a Notion URL or ID"
            />
            <button onClick={inspect} disabled={busy}>
              <Sparkles size={18} /> Inspect manuscript
            </button>
          </div>
          {message ? <p className="errorText">{message}</p> : null}
          <p className="hint">
            Use <strong>demo</strong> to open the fixture manuscript without Notion credentials.
          </p>
        </div>

        {inspection ? (
          <div className="resultsPanel">
            <div className="panelTitle">
              <Database size={20} /> {inspection.name}
            </div>
            <label>
              Manuscript name
              <input
                value={inspection.name}
                onChange={(event) => setInspection({ ...inspection, name: event.target.value })}
              />
            </label>
            <div className="metricStrip">
              <div>
                <strong>{inspection.totalWords.toLocaleString()}</strong>
                <span>current words</span>
              </div>
              <div>
                <strong>{inspection.sources.filter((s) => s.included).length}</strong>
                <span>included pages</span>
              </div>
            </div>
            <div className="chapterList">
              {inspection.sources.map((source) => (
                <div className="chapterRow" key={source.notionPageId}>
                  <label>
                    <input
                      type="checkbox"
                      checked={source.included}
                      onChange={(event) =>
                        setInspection({
                          ...inspection,
                          sources: inspection.sources.map((s) =>
                            s.notionPageId === source.notionPageId
                              ? { ...s, included: event.target.checked }
                              : s,
                          ),
                        })
                      }
                    />{" "}
                    {source.title}
                  </label>
                  <strong>{source.wordCount.toLocaleString()}</strong>
                </div>
              ))}
            </div>
            <button className="primaryWide" onClick={saveAndSync} disabled={busy}>
              <RefreshCw size={18} /> Sync now
            </button>
          </div>
        ) : null}
      </section>

      {savedId ? (
        <Configuration id={savedId} demo={status?.mode === "demo"} onSync={setStats} />
      ) : null}
      {stats ? <Dashboard stats={stats} /> : null}
    </main>
  );
}

function Dashboard({ stats }: { stats: Stats }) {
  return (
    <section className="dashboard" aria-label="Manuscript dashboard">
      <div className="dashboardHeader">
        <div>
          <p className="eyebrow">Dashboard</p>
          <h2>{stats.manuscriptName}</h2>
        </div>
        <span>
          {stats.lastSyncedAt
            ? `Last synced ${new Date(stats.lastSyncedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit", timeZone: stats.timezone })}`
            : "Not synced yet"}
        </span>
      </div>
      <div className="statGrid">
        <Stat label="total words" value={stats.totalWords} />
        <Stat label="net words today" value={stats.netWordsToday} signed />
        <Stat label="this week" value={stats.netChangeThisWeek} signed />
        <Stat label="this month" value={stats.netChangeThisMonth} signed />
      </div>
      <div className="twoColumn">
        <div>
          <h3>Chapters</h3>
          {stats.chapters.map((chapter) => (
            <div className="chapterRow" key={chapter.sourceId}>
              <span>{chapter.title}</span>
              <strong>{chapter.wordCount.toLocaleString()}</strong>
            </div>
          ))}
        </div>
        <div>
          <h3>Recent syncs</h3>
          {stats.recentSyncs.map((sync) => (
            <div className="chapterRow" key={sync.syncRunId}>
              <span>
                {new Date(sync.capturedAt).toLocaleString(undefined, { timeZone: stats.timezone })}
              </span>
              <strong>
                {sync.delta === null ? "--" : `${sync.delta >= 0 ? "+" : ""}${sync.delta}`}
              </strong>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}

function Stat({
  label,
  value,
  signed = false,
}: {
  label: string;
  value: number;
  signed?: boolean;
}) {
  const formatted = `${signed && value > 0 ? "+" : ""}${value.toLocaleString()}`;
  return (
    <div className="stat">
      <strong>{formatted}</strong>
      <span>{label}</span>
    </div>
  );
}
