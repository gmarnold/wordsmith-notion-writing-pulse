import { readFile } from "node:fs/promises";
import type { FastifyInstance } from "fastify";
import type { SyncEngine } from "./syncEngine.js";
export function registerWebAssets(server: FastifyInstance, engine: SyncEngine, hosted = false) {
  const html = () => readFile(new URL("../../web/dist/index.html", import.meta.url), "utf8");
  server.get<{ Params: { token: string } }>(
    "/embed/:token",
    { logLevel: "silent" },
    async (r, reply) => {
      reply.header("Cache-Control", "no-store").header("Referrer-Policy", "no-referrer");
      if (!(await engine.embed(r.params.token))) return reply.code(404).send("Embed unavailable");
      return reply.type("text/html").send(await html());
    },
  );
  server.get<{ Params: { file: string } }>("/assets/:file", async (r, reply) => {
    const file = r.params.file;
    if (!/^[a-zA-Z0-9_-]+\.(js|css)$/.test(file)) return reply.code(404).send();
    try {
      return reply
        .type(file.endsWith(".css") ? "text/css" : "application/javascript")
        .header("Cache-Control", "public, max-age=31536000, immutable")
        .send(await readFile(new URL("../../web/dist/assets/" + file, import.meta.url)));
    } catch {
      return reply.code(404).send();
    }
  });
  if (hosted) {
    // The public shell contains no configuration; private API calls require a session.
    for (const path of ["/", "/login"])
      server.get(path, async (_r, reply) =>
        reply
          .header("Cache-Control", "no-store")
          .header("X-Frame-Options", "DENY")
          .type("text/html")
          .send(await html()),
      );
  }
}
