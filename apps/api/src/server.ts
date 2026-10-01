import cors from "@fastify/cors";
import Fastify from "fastify";
import { ZodError } from "zod";
import { config } from "./config.js";
import { createDb } from "./db/client.js";
import { createWordsmithService } from "./service.js";
import { DrizzleRepository, MemoryRepository } from "./repository.js";
import { ApiProblem } from "./problems.js";

export function buildServer() {
  const server = Fastify({ logger: true });
  const db = createDb();
  const repository = db ? new DrizzleRepository(db) : new MemoryRepository();
  const service = createWordsmithService(repository);

  server.register(cors, { origin: config.WEB_ORIGIN });

  server.setErrorHandler((error, _request, reply) => {
    if (error instanceof ApiProblem) {
      return reply.status(error.statusCode).send({ error: { code: error.code, message: error.message, details: error.details } });
    }
    if (error instanceof ZodError) {
      return reply.status(400).send({ error: { code: "INVALID_INPUT", message: "The request did not match Wordsmith's API contract.", details: error.flatten() } });
    }
    server.log.error(error);
    return reply.status(500).send({ error: { code: "INTERNAL_ERROR", message: "Wordsmith could not complete that request." } });
  });

  server.get("/api/health", async () => ({ ok: true, demoMode: config.WORDSMITH_DEMO_MODE }));
  server.get("/api/notion/status", async () => service.notionStatus());
  server.get("/api/manuscripts", async () => service.listManuscripts());
  server.post("/api/manuscripts/inspect", async (request) => service.inspect(request.body));
  server.post("/api/manuscripts", async (request) => service.createManuscript(request.body));

  server.get<{ Params: { id: string } }>("/api/manuscripts/:id", async (request, reply) => {
    const manuscript = await service.getManuscript(request.params.id);
    return manuscript ?? reply.status(404).send({ error: { code: "NOT_FOUND", message: "Manuscript not found." } });
  });

  server.post<{ Params: { id: string } }>("/api/manuscripts/:id/sync", async (request, reply) => {
    const stats = await service.sync(request.params.id);
    return stats ?? reply.status(404).send({ error: { code: "NOT_FOUND", message: "Manuscript not found." } });
  });

  server.get<{ Params: { id: string } }>("/api/manuscripts/:id/stats", async (request, reply) => {
    const stats = await service.stats(request.params.id);
    return stats ?? reply.status(404).send({ error: { code: "NOT_FOUND", message: "Manuscript not found." } });
  });

  return server;
}

