import { localConfigurationOrigins } from "./localAccess.js";
import cors from "@fastify/cors";
import Fastify, { LogController } from "fastify";
import { registerPublicRoutes } from "./webhooks.js";
import { SyncStore } from "./syncStore.js";
import { ZodError } from "zod";
import { config as defaultConfig } from "./config.js";
import { createDb } from "./db/client.js";
import { createWordsmithService } from "./service.js";
import { DrizzleRepository, MemoryRepository } from "./repository.js";
import { ApiProblem } from "./problems.js";
import { sql } from "drizzle-orm";
import type { Db } from "./db/client.js";
import type { AppConfig } from "./environment.js";
import type { Repository } from "./repository.js";
import type { WritingClient } from "./properties.js";
import { AdminStore } from "./adminStore.js";
import { registerAdminAuth } from "./adminAuth.js";
import { registerWebAssets } from "./webAssets.js";
import { errorCategory } from "./observability.js";
import { withDatabaseSyncLock } from "./db/syncLock.js";

export function buildServer(
  options: {
    config?: AppConfig;
    db?: Db | null;
    repository?: Repository;
    client?: WritingClient;
    worker?: boolean;
  } = {},
) {
  const config = options.config ?? defaultConfig;
  const hosted = config.NODE_ENV === "production";
  const server = Fastify({
    logger: true,
    logController: new LogController({ disableRequestLogging: true }),
  });
  const db = options.db === undefined ? createDb(config) : options.db;
  if (!config.WORDSMITH_DEMO_MODE && !db)
    throw new Error(
      "Set DATABASE_URL for persistent live tracking, or enable WORDSMITH_DEMO_MODE.",
    );
  const repository =
    options.repository ?? (db ? new DrizzleRepository(db) : new MemoryRepository());
  const adminStore = hosted && db ? new AdminStore(db) : undefined;
  if (adminStore) registerAdminAuth(server, config, adminStore);
  else server.get("/api/auth/session", async () => ({ required: false, authenticated: true }));
  // A PostgreSQL advisory transaction lock serializes old/new workers during rolling deploys.
  const lock =
    hosted && db && options.db === undefined
      ? async <T>(fn: () => Promise<T>): Promise<T> => {
          return withDatabaseSyncLock(db, fn);
        }
      : undefined;
  const service = createWordsmithService(repository, new SyncStore(db), {
    config,
    client: options.client,
    lock,
    log: (fields, message) => server.log.info(fields, message),
  });

  const databaseReady = async () => {
    if (!db) return config.WORDSMITH_DEMO_MODE;
    await db.execute(sql`SELECT 1 FROM manuscripts LIMIT 0`);
    await db.execute(sql`SELECT 1 FROM manuscript_sources LIMIT 0`);
    await db.execute(sql`SELECT 1 FROM sync_runs LIMIT 0`);
    await db.execute(sql`SELECT 1 FROM word_count_snapshots LIMIT 0`);
    await db.execute(sql`SELECT 1 FROM manuscript_settings LIMIT 0`);
    await db.execute(sql`SELECT 1 FROM webhook_events LIMIT 0`);
    if (hosted) {
      await db.execute(sql`SELECT 1 FROM admin_sessions LIMIT 0`);
      await db.execute(sql`SELECT 1 FROM integration_state LIMIT 0`);
    }
    return true;
  };
  if (hosted)
    server.addHook("onReady", async () => {
      try {
        await databaseReady();
        await adminStore?.ensureIntegration();
        if (config.NOTION_WEBHOOK_VERIFICATION_TOKEN) await adminStore?.clearSetup();
      } catch {
        throw new Error(
          "DATABASE: startup readiness failed. Check DATABASE_URL and run migrations.",
        );
      }
    });

  let working = false;
  let workerTask: Promise<unknown> | undefined;
  const worker = setInterval(() => {
    if (options.worker === false) return;
    if (working) return;
    working = true;
    workerTask = service.engine
      .process()
      .then((results) => {
        for (const result of results) server.log.info(result, "Automatic scene sync");
      })
      .catch(() => server.log.error({ category: "DATABASE" }, "Webhook worker unavailable"))
      .finally(() => {
        working = false;
      });
  }, 1000);
  worker.unref();
  server.addHook("onClose", async () => {
    clearInterval(worker);
    await workerTask;
    if (db && options.db === undefined) await db.$client.end({ timeout: 5 });
  });
  server.decorate("syncEngine", service.engine);
  registerPublicRoutes(server, service.engine, { config, adminStore });
  if (hosted) registerWebAssets(server, service.engine, true);

  server.addHook("onSend", async (r, reply) => {
    reply.header("X-Content-Type-Options", "nosniff").header("Referrer-Policy", "no-referrer");
    if (hosted) {
      reply.header("Strict-Transport-Security", "max-age=31536000");
      const embed = r.url.startsWith("/embed/") || r.url.startsWith("/api/embed/");
      reply.header(
        "Content-Security-Policy",
        "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self' data:; object-src 'none'; base-uri 'none'; form-action 'self'; frame-src 'self'; frame-ancestors " +
          (embed
            ? "https://notion.so https://*.notion.so https://notion.site https://*.notion.site 'self'"
            : "'none'"),
      );
    }
  });

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

  const allowedOrigins = hosted
    ? [config.PUBLIC_ORIGIN!]
    : localConfigurationOrigins(config.WEB_ORIGIN);
  server.addHook("onRequest", async (request, reply) => {
    if (
      (!hosted && !/^(localhost|127\.0\.0\.1)(:\d+)?$/.test(request.headers.host ?? "")) ||
      (request.headers.origin && !allowedOrigins.includes(request.headers.origin))
    )
      return reply
        .code(403)
        .send({
          error: {
            message: hosted
              ? "Use the hosted Wordsmith app on its configured origin."
              : "Use the local Wordsmith configuration app.",
          },
        });
  });
  server.register(cors, { origin: allowedOrigins, credentials: hosted });

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
    const category = errorCategory(error);
    server.log.error(
      { category, requestId: _request.id },
      "Request failed; details omitted to protect content and credentials",
    );
    return reply.status(category === "DATABASE" ? 503 : 500).send({
      error: { code: "INTERNAL_ERROR", message: "Wordsmith could not complete that request." },
    });
  });

  server.get("/api/health", async (_r, reply) => {
    try {
      await databaseReady();
      return {
        ok: true,
        status: "ok",
        database: db ? "connected" : "fixture",
        notionConfigured: !!config.NOTION_TOKEN && !config.WORDSMITH_DEMO_MODE,
        webhookConfigured: !!config.NOTION_WEBHOOK_VERIFICATION_TOKEN,
        demoMode: config.WORDSMITH_DEMO_MODE,
        version: "0.1.0",
        timestamp: new Date().toISOString(),
      };
    } catch {
      return reply.code(503).send({ ok: false, status: "unavailable", database: "unavailable" });
    }
  });
  server.get("/api/notion/status", async () => {
    const status = await service.notionStatus();
    if (status.reachable && "workspaceName" in status)
      await adminStore?.workspace(status.workspaceName ?? null);
    return status;
  });
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
