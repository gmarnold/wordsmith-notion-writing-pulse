export function localConfigurationOrigins(configuredOrigin: string): string[] {
  const configured = new URL(configuredOrigin);
  const origins = new Set([configured.origin]);
  if (configured.hostname === "localhost" || configured.hostname === "127.0.0.1") {
    const alias = new URL(configured.origin);
    alias.hostname = configured.hostname === "localhost" ? "127.0.0.1" : "localhost";
    origins.add(alias.origin);
  }
  return [...origins];
}
