import { useEffect, useState } from "react";
import { api } from "./api";
import { App } from "./App";
import "./styles.css";

export function AuthGate() {
  const [session, setSession] = useState<{ required: boolean; authenticated: boolean } | null>(
    null,
  );
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api<{ required: boolean; authenticated: boolean }>("/api/auth/session")
      .then(setSession)
      .catch(() => setMessage("Wordsmith is unavailable. Try again shortly."));
    const expired = () => setSession({ required: true, authenticated: false });
    window.addEventListener("wordsmith-sign-in-required", expired);
    return () => window.removeEventListener("wordsmith-sign-in-required", expired);
  }, []);
  if (session?.authenticated)
    return (
      <>
        {session.required ? (
          <div className="sessionBar">
            <button
              onClick={async () => {
                await api("/api/auth/logout", "POST");
                setSession({ required: true, authenticated: false });
              }}
            >
              Sign out
            </button>
          </div>
        ) : null}
        <App hosted={session.required} />
      </>
    );
  return (
    <main className="shell">
      <section className="setupPanel loginPanel">
        <p className="eyebrow">Wordsmith</p>
        <h1>{session ? "Sign in to Wordsmith" : "Connecting to Wordsmith"}</h1>
        {session ? (
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setBusy(true);
              setMessage("");
              try {
                await api("/api/auth/login", "POST", { password });
                setSession({ required: true, authenticated: true });
              } catch (error) {
                setMessage(error instanceof Error ? error.message : "Sign-in failed.");
              } finally {
                setPassword("");
                setBusy(false);
              }
            }}
          >
            <label>
              Admin password
              <input
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </label>
            <button type="submit" disabled={busy}>
              Sign in
            </button>
          </form>
        ) : null}
        {message ? <p role="alert">{message}</p> : null}
      </section>
    </main>
  );
}
