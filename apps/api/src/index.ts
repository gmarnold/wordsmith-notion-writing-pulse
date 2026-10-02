import { config } from "./config.js";
import { buildServer } from "./server.js";

const server = buildServer();

import { buildPublicServer } from "./publicServer.js";
import type { SyncEngine } from "./syncEngine.js";
let ingress: ReturnType<typeof buildPublicServer> | undefined;
try {
  await server.listen({
    port: config.NODE_ENV === "production" ? config.PORT : config.API_PORT,
    host: config.NODE_ENV === "production" ? "0.0.0.0" : "127.0.0.1",
  });
  if (config.NODE_ENV !== "production") {
    ingress = buildPublicServer((server as typeof server & { syncEngine: SyncEngine }).syncEngine);
    await ingress.listen({ port: config.PUBLIC_PORT, host: "127.0.0.1" });
  }
} catch {
  server.log.error(
    { category: "CONFIGURATION" },
    "Startup failed; check required environment, database migrations and listener ports.",
  );
  await ingress?.close();
  await server.close();
  process.exitCode = 1;
}
let closing = false;
for (const signal of ["SIGTERM", "SIGINT"] as const)
  process.on(signal, () => {
    if (closing) return;
    closing = true;
    void (async () => {
      await ingress?.close();
      await server.close();
    })().catch(() => {
      process.exitCode = 1;
    });
  });
