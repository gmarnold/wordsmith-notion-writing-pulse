import Fastify from "fastify";
import { readFile } from "node:fs/promises";
import type { SyncEngine } from "./syncEngine.js";
import { registerPublicRoutes } from "./webhooks.js";
export function buildPublicServer(engine: SyncEngine) {
  const server = Fastify({ logger: false });
  registerPublicRoutes(server, engine);
  server.get<{ Params: { token: string } }>("/embed/:token", async (r, reply) => {
    if (!(await engine.embed(r.params.token))) return reply.code(404).send("Embed unavailable");
    reply.header("Cache-Control", "no-store").header("Referrer-Policy", "no-referrer");
    return reply
      .type("text/html")
      .send(await readFile(new URL("../../web/dist/index.html", import.meta.url), "utf8"));
  });
  server.get<{ Params: { file: string } }>("/assets/:file", async (r, reply) => {
    const file = r.params.file;
    if (!/^[a-zA-Z0-9_-]+\.(js|css)$/.test(file)) return reply.code(404).send();
    try {
      return reply
        .type(file.endsWith(".css") ? "text/css" : "application/javascript")
        .send(await readFile(new URL(`../../web/dist/assets/${file}`, import.meta.url)));
    } catch {
      return reply.code(404).send();
    }
  });
  return server;
}
