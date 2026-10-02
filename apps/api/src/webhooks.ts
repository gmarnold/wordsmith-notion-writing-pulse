import { writeFile } from "node:fs/promises";
import { verifyWebhookSignature } from "@notionhq/client";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { config as defaultConfig } from "./config.js";
import type { SyncEngine } from "./syncEngine.js";
import type { AppConfig } from "./environment.js";
import type { AdminStore } from "./adminStore.js";
import { digest, encryptToken } from "./adminAuth.js";
const eventSchema = z.object({
  id: z.string().min(1).max(200),
  type: z.string(),
  entity: z.object({ id: z.string().uuid(), type: z.literal("page") }),
});
export function registerPublicRoutes(
  server: FastifyInstance,
  engine: SyncEngine,
  options: { config?: AppConfig; adminStore?: AdminStore } = {},
) {
  const config = options.config ?? defaultConfig;
  server.register(async (scope) => {
    scope.removeContentTypeParser("application/json");
    scope.addContentTypeParser("application/json", { parseAs: "buffer" }, (_r, body, done) =>
      done(null, body),
    );
    scope.post(
      "/api/webhooks/notion",
      { bodyLimit: 64 * 1024, logLevel: "silent" },
      async (request, reply) => {
        const raw = request.body as Buffer;
        let body: unknown;
        try {
          body = JSON.parse(raw.toString("utf8"));
        } catch {
          return reply.code(400).send({ error: "Invalid JSON" });
        }
        const verification = z
          .object({ verification_token: z.string().min(1).max(512) })
          .strict()
          .safeParse(body);
        if (verification.success) {
          if (!config.NOTION_WEBHOOK_SETUP || config.NOTION_WEBHOOK_VERIFICATION_TOKEN)
            return reply.code(403).send({ error: "Setup disabled" });
          if (config.NODE_ENV === "production") {
            const nonce = (request.query as { setup?: string }).setup;
            if (
              !nonce ||
              !options.adminStore ||
              !(await options.adminStore.captureSetup(
                digest(nonce),
                encryptToken(verification.data.verification_token, config.SESSION_SECRET!),
              ))
            )
              return reply
                .code(403)
                .send({
                  error: "Prepare a new verification attempt in the authenticated admin app.",
                });
            server.log.info(
              { category: "CONFIGURATION" },
              "Verification token captured; retrieve it in the admin app, never in logs.",
            );
            return { received: true };
          }
          try {
            await writeFile(
              new URL("../.webhook-verification-token", import.meta.url),
              verification.data.verification_token,
              { flag: "wx", mode: 0o600 },
            );
          } catch {
            return reply.code(409).send({
              error: "Token already captured. Remove the local token file before resending.",
            });
          }
          server.log.info(
            "Notion verification token saved to apps/api/.webhook-verification-token. Complete setup locally.",
          );
          return { received: true };
        }
        const signature = request.headers["x-notion-signature"];
        if (
          !config.NOTION_WEBHOOK_VERIFICATION_TOKEN ||
          typeof signature !== "string" ||
          !(await verifyWebhookSignature({
            body: raw,
            signature,
            verificationToken: config.NOTION_WEBHOOK_VERIFICATION_TOKEN,
          }))
        ) {
          server.log.warn(
            { category: "WEBHOOK_SIGNATURE", requestId: request.id },
            "Webhook signature rejected",
          );
          return reply.code(401).send({ error: "Invalid signature" });
        }
        const event = eventSchema.safeParse(body);
        if (!event.success) return reply.code(400).send({ error: "Invalid event" });
        if (event.data.type !== "page.content_updated") return { status: "ignored" };
        let result;
        try {
          result = await engine.receive(event.data.id, event.data.entity.id);
        } catch {
          server.log.error(
            { category: "DATABASE", eventId: event.data.id },
            "Webhook persistence failed; delivery not acknowledged",
          );
          return reply.code(503).send({ error: "Webhook storage unavailable; retry delivery" });
        }
        server.log.info(
          {
            eventId: event.data.id,
            pageId: event.data.entity.id,
            tracked: result.status !== "ignored",
            status: result.status,
            requestId: request.id,
          },
          "Verified Notion content event",
        );
        return reply.code(202).send(result);
      },
    );
  });
  server.get<{ Params: { token: string } }>(
    "/api/embed/:token",
    { logLevel: "silent" },
    async (r, reply) => {
      reply
        .header("Cache-Control", "no-store")
        .header("Referrer-Policy", "no-referrer")
        .header("X-Content-Type-Options", "nosniff");
      const stats = await engine.embed(r.params.token);
      if (!stats)
        server.log.warn(
          { category: "EMBED_ACCESS", requestId: r.id },
          "Embed unavailable; bearer path omitted",
        );
      return stats ?? reply.code(404).send({ error: "Embed unavailable" });
    },
  );
}
