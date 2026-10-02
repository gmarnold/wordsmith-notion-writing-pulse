import { useEffect, useState } from "react";
import type { Settings, Stats, SyncRun } from "@wordsmith/shared";
import { api, syncManuscript } from "./api";
type Property = { id: string; name: string; type: string };
export function Configuration({
  id,
  demo,
  onSync,
}: {
  id: string;
  demo: boolean;
  onSync: (stats: Stats) => void;
}) {
  const [settings, setSettings] = useState<Settings | null>(null);
  const [properties, setProperties] = useState<Property[]>([]);
  const [runs, setRuns] = useState<SyncRun[]>([]);
  const [message, setMessage] = useState("");
  const [embed, setEmbed] = useState<string | null>(null);
  const [syncState, setSyncState] = useState<{ configured: boolean; pendingEvents: number } | null>(
    null,
  );
  useEffect(() => {
    api<Settings>(`/api/manuscripts/${id}/settings`)
      .then(setSettings)
      .catch((e: Error) => setMessage(e.message));
    api<Property[]>(`/api/manuscripts/${id}/properties`)
      .then(setProperties)
      .catch(() => setMessage("Could not inspect properties. Check database access."));
    const load = () => {
      void api<SyncRun[]>(`/api/manuscripts/${id}/sync-status`)
        .then(setRuns)
        .catch(() => {});
      return api<{ configured: boolean; pendingEvents: number }>("/api/webhook/status")
        .then(setSyncState)
        .catch(() => {});
    };
    void load();
    const timer = setInterval(load, 15000);
    return () => clearInterval(timer);
  }, [id]);
  const act = async (fn: () => Promise<unknown>, success: string) => {
    try {
      await fn();
      setMessage(success);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : "Request failed");
    }
  };
  if (!settings) return null;
  return (
    <section className="dashboard" aria-label="Manuscript configuration">
      <h2>Manuscript settings</h2>
      <p className="hint">
        {syncState?.configured ? "Webhook verification configured" : "Webhook setup needed"} ·{" "}
        {syncState?.pendingEvents ?? 0} queued events ·{" "}
        {settings.wordCountPropertyId
          ? "Word Count property mapped"
          : "Word Count property not mapped"}
      </p>
      <div className="configGrid">
        <label>
          Writer timezone
          <input
            value={settings.timezone}
            onChange={(e) => setSettings({ ...settings, timezone: e.target.value })}
            placeholder="America/Chicago"
          />
        </label>
        {(["DAILY", "WEEKLY", "MONTHLY", "TOTAL"] as const).map((type) => (
          <label key={type}>
            {type.toLowerCase()} goal
            <input
              type="number"
              min="1"
              value={settings.goals[type] ?? ""}
              onChange={(e) =>
                setSettings({
                  ...settings,
                  goals: {
                    ...settings.goals,
                    [type]: e.target.value === "" ? null : Number(e.target.value),
                  },
                })
              }
            />
          </label>
        ))}
        {(["wordCountPropertyId", "lastCountedPropertyId"] as const).map((key, index) => (
          <label key={key}>
            {index === 0 ? "Word Count (Number)" : "Last Counted (Date, optional)"}
            <select
              value={settings[key] ?? ""}
              onChange={(e) => setSettings({ ...settings, [key]: e.target.value || null })}
            >
              <option value="">Not mapped</option>
              {properties
                .filter((p) => p.type === (index === 0 ? "number" : "date"))
                .map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name}
                  </option>
                ))}
            </select>
          </label>
        ))}
      </div>
      <p className="hint">
        In Notion, add a Number property named Word Count and optionally a Date property named Last
        Counted, then reload to select them. Wordsmith saves their stable IDs.
      </p>
      <div className="buttonRow">
        <button
          onClick={() =>
            act(
              () => api(`/api/manuscripts/${id}/settings`, "PUT", settings),
              "Settings saved. Sync to apply property values.",
            )
          }
        >
          Save settings
        </button>
        <button
          onClick={() =>
            act(
              async () => onSync(await syncManuscript(id)),
              "Sync finished. Check mapped properties in Notion.",
            )
          }
        >
          Sync now
        </button>
        <button
          onClick={() =>
            act(async () => {
              const result = await api<{ token: string; url: string }>(
                `/api/manuscripts/${id}/embed`,
                "POST",
              );
              setEmbed(result.url);
            }, "Read-only embed enabled. Creating another link revokes the previous one.")
          }
        >
          Create embed link
        </button>
        <button
          onClick={() =>
            act(async () => {
              await api(`/api/manuscripts/${id}/embed`, "DELETE");
              setEmbed(null);
            }, "Embed revoked.")
          }
        >
          Revoke embed
        </button>
        {demo ? (
          <button
            onClick={() =>
              act(
                () => api(`/api/demo/${id}/edit`, "POST"),
                "Demo edit queued: +100 words. Stats refresh within 15 seconds.",
              )
            }
          >
            Simulate scene edit
          </button>
        ) : null}
      </div>
      {runs[0] ? (
        <p className="hint">
          Latest sync: {runs[0].status.replaceAll("_", " ")} ·{" "}
          {formatTime(runs[0].startedAt, settings.timezone)}
          {runs[0].errorSummary ? ` ? ${runs[0].errorSummary}` : ""}
        </p>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
      {embed ? (
        <>
          <p className="hint">
            Private bearer link. Replace localhost:4142 with your public HTTPS host for Notion.
          </p>
          <a href={embed} target="_blank" rel="noreferrer">
            Open embed preview
          </a>
          <input aria-label="Embed URL" readOnly value={embed} />
          <iframe title="Wordsmith embed preview" className="embedPreview" src={embed} />
        </>
      ) : null}
    </section>
  );
}

function formatTime(value: string, timezone: string) {
  try {
    return new Date(value).toLocaleString(undefined, { timeZone: timezone });
  } catch {
    return new Date(value).toLocaleString(undefined, { timeZone: "UTC" });
  }
}
