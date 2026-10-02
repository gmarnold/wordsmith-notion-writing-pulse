import Fastify from "fastify";
import { registerWebAssets } from "./webAssets.js";
import type { SyncEngine } from "./syncEngine.js";
import { registerPublicRoutes } from "./webhooks.js";
export function buildPublicServer(engine: SyncEngine) {
  const server = Fastify({ logger: false });
  registerPublicRoutes(server, engine);
  registerWebAssets(server, engine);
  return server;
}
