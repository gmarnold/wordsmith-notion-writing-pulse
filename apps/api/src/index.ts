import { config } from "./config.js";
import { buildServer } from "./server.js";

const server = buildServer();

await server.listen({ port: config.API_PORT, host: "127.0.0.1" });

import { buildPublicServer } from "./publicServer.js";
import type { SyncEngine } from "./syncEngine.js";
const ingress = buildPublicServer(
  (server as typeof server & { syncEngine: SyncEngine }).syncEngine,
);
await ingress.listen({ port: config.PUBLIC_PORT, host: "127.0.0.1" });
