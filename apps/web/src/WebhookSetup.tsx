import { useState } from "react";
import { api } from "./api";

export function WebhookSetup() {
  const [url, setUrl] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  return (
    <section aria-label="Hosted webhook setup">
      <h3>One-time webhook verification</h3>
      <p className="hint">
        Enable NOTION_WEBHOOK_SETUP in your hosting environment before preparing the subscription.
        Verification credentials appear here only for the signed-in admin.
      </p>
      <div className="buttonRow">
        <button
          onClick={async () => {
            try {
              const setup = await api<{ url?: string; error?: { message: string } }>(
                "/api/webhook/setup",
                "POST",
              );
              if (!setup.url) throw new Error(setup.error?.message ?? "Setup unavailable.");
              setUrl(setup.url);
              setToken(null);
              setMessage("Create the Notion subscription with this exact URL within 15 minutes.");
            } catch (e) {
              setMessage(e instanceof Error ? e.message : "Setup failed.");
            }
          }}
        >
          Prepare webhook subscription
        </button>
        <button
          onClick={async () => {
            try {
              const result = await api<{ token: string | null }>("/api/webhook/setup");
              setToken(result.token);
              setMessage(
                result.token
                  ? "Copy this token into Notion verification and the hosting environment. Disable setup mode and redeploy."
                  : "No token captured. Prepare the subscription, or resend before the 15-minute window expires.",
              );
            } catch {
              setMessage("Could not retrieve verification status.");
            }
          }}
        >
          Check verification token
        </button>
      </div>
      {url ? (
        <label>
          Webhook subscription URL
          <input readOnly value={url} />
        </label>
      ) : null}
      {token ? (
        <>
          <label>
            Verification token
            <input readOnly type="password" value={token} />
          </label>
          <button
            onClick={async () => {
              try {
                await navigator.clipboard.writeText(token);
                setMessage(
                  "Verification token copied. Paste only into Notion and the hosting environment.",
                );
              } catch {
                setMessage(
                  "Clipboard access failed. Allow clipboard access for this HTTPS site, then retry.",
                );
              }
            }}
          >
            Copy verification token
          </button>
        </>
      ) : null}
      {message ? <p role="status">{message}</p> : null}
    </section>
  );
}
