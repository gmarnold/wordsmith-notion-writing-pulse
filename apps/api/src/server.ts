import { localConfigurationOrigins } from "./localAccess.js";
import cors from "@fastify/cors";
import Fastify from "fastify";
import { registerPublicRoutes } from "./webhooks.js";
import { SyncStore } from "./syncStore.js";
import { ZodError } from "zod";
import { config } from "./config.js";
import { createDb } from "./db/client.js";
import { createWordsmithService } from "./service.js";
import { DrizzleRepository, MemoryRepository } from "./repository.js";
import { ApiProblem } from "./problems.js";

export function buildServer() {
  const server = Fastify({ logger: true });
  const db = createDb();
  if (!config.WORDSMITH_DEMO_MODE && !db)
    throw new Error(
      "Set DATABASE_URL for persistent live tracking, or enable WORDSMITH_DEMO_MODE.",
    );
  const repository = db ? new DrizzleRepository(db) : new MemoryRepository();
  const service = createWordsmithService(repository, new SyncStore(db));

  let working = false;
  const worker = setInterval(() => {
    if (working) return;
    working = true;
    void service.engine
      .process()
      .then((results) => {
        for (const result of results) server.log.info(result, "Automatic scene sync");
      })
      .catch(() => server.log.error("Webhook worker unavailable"))
      .finally(() => {
        working = false;
      });
  }, 1000);
  worker.unref();
  server.addHook("onClose", async () => {
    clearInterval(worker);
  });
  server.decorate("syncEngine", service.engine);
  registerPublicRoutes(server, service.engine);

  server.get<{ Params: { id: string } }>("/api/manuscripts/:id/settings", (r) =>
    service.engine.settings(r.params.id),
  );
  server.put<{ Params: { id: string } }>("/api/manuscripts/:id/settings", (r) =>
    service.engine.settings(r.params.id, r.body),
  );
  server.get<{ Params: { id: string } }>("/api/manuscripts/:id/properties", (r) =>
    service.engine.properties(r.params.id),
  );
  server.post<{ Params: { id: string } }>("/api/manuscripts/:id/embed", async (r) => {
    const link = await service.engine.enableEmbed(r.params.id);
    return link
      ? {
          ...link,
          url: `${config.PUBLIC_ORIGIN ?? `http://localhost:${config.PUBLIC_PORT}`}/embed/${link.token}`,
        }
      : null;
  });
  server.delete<{ Params: { id: string } }>("/api/manuscripts/:id/embed", async (r) => {
    await service.engine.revokeEmbed(r.params.id);
    return { revoked: true };
  });
  server.get<{ Params: { id: string } }>("/api/manuscripts/:id/sync-status", (r) =>
    repository.getSyncRuns(r.params.id),
  );
  server.get("/api/webhook/status", async () => ({
    configured: !!config.NOTION_WEBHOOK_VERIFICATION_TOKEN,
    pendingEvents: (await service.engine.store.pending()).length,
  }));
  server.post<{ Params: { id: string } }>("/api/demo/:id/edit", async (r, reply) => {
    if (!config.WORDSMITH_DEMO_MODE) return reply.code(404).send();
    const m = await repository.getManuscript(r.params.id);
    if (!m) return reply.code(404).send();
    return service.demoEdit(m.sources[0]!.notionPageId);
  });

  const allowedOrigins = localConfigurationOrigins(config.WEB_ORIGIN);
  server.addHook("onRequest", async (request, reply) => {
    if (
      !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(request.headers.host ?? "") ||
      (request.headers.origin && !allowedOrigins.includes(request.headers.origin))
    )
      return reply
        .code(403)
        .send({ error: { message: "Use the local Wordsmith configuration app." } });
  });
  server.register(cors, { origin: allowedOrigins });

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiProblem) {
      return reply
        .status(error.statusCode)
        .send({ error: { code: error.code, message: error.message, details: error.details } });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({
        error: {
          code: "INVALID_INPUT",
          message: "The request did not match Wordsmith's API contract.",
          details: error.flatten(),
        },
      });
    }
    server.log.error(
      { name: error instanceof Error ? error.name : "UnknownError" },
      "Request failed; details omitted to protect content and credentials",
    );
    return reply.status(500).send({
      error: { code: "INTERNAL_ERROR", message: "Wordsmith could not complete that request." },
    });
  });

  server.get("/api/health", async () => ({ ok: true, demoMode: config.WORDSMITH_DEMO_MODE }));
  server.get("/api/notion/status", async () => service.notionStatus());
  server.get("/api/manuscripts", async () => service.listManuscripts());
  server.post("/api/manuscripts/inspect", async (request) => service.inspect(request.body));
  server.post("/api/manuscripts", async (request) => service.createManuscript(request.body));

  server.get<{ Params: { id: string } }>("/api/manuscripts/:id", async (request, reply) => {
    const manuscript = await service.getManuscript(request.params.id);
    return (
      manuscript ??
      reply.status(404).send({ error: { code: "NOT_FOUND", message: "Manuscript not found." } })
    );
  });

  server.post<{ Params: { id: string } }>("/api/manuscripts/:id/sync", async (request, reply) => {
    const stats = await service.sync(request.params.id);
    return (
      stats ??
      reply.status(404).send({ error: { code: "NOT_FOUND", message: "Manuscript not found." } })
    );
  });

  server.get<{ Params: { id: string } }>("/api/manuscripts/:id/stats", async (request, reply) => {
    const stats = await service.stats(request.params.id);
    return (
      stats ??
      reply.status(404).send({ error: { code: "NOT_FOUND", message: "Manuscript not found." } })
    );
  });

  return server;
}
