import Fastify from "fastify";
import { beforeAll, describe, expect, it, vi } from "vitest";
import { signWebhookPayload } from "@notionhq/client";
import { FixtureNotionClient } from "@wordsmith/notion";
import { MemoryRepository } from "./repository.js";
import { createSyncEngine } from "./syncEngine.js";
const secret = "fixture-only-not-a-real-secret";
beforeAll(() => {
  vi.stubEnv("NOTION_WEBHOOK_VERIFICATION_TOKEN", secret);
  vi.stubEnv("WORDSMITH_DEMO_MODE", "true");
});
describe("raw signed webhook ingress", () => {
  it("accepts signed raw bytes, rejects tampering and invalid signatures, ignores property events", async () => {
    const { registerPublicRoutes } = await import("./webhooks.js");
    const repository = new MemoryRepository();
    const engine = createSyncEngine(repository, new FixtureNotionClient());
    const server = Fastify();
    registerPublicRoutes(server, engine);
    const body =
      ' { "id": "fixture-1", "type": "page.content_updated", "entity": {"id":"22222222-2222-4222-8222-222222222222", "type":"page"} } ';
    const signature = await signWebhookPayload({ body, verificationToken: secret });
    const send = (payload = body, sig = signature) =>
      server.inject({
        method: "POST",
        url: "/api/webhooks/notion",
        headers: { "content-type": "application/json", "x-notion-signature": sig },
        payload,
      });
    expect((await send()).statusCode).toBe(202);
    expect((await send()).json()).toEqual({ status: "ignored" });
    expect((await send(JSON.stringify(JSON.parse(body)))).statusCode).toBe(401);
    expect((await send(body, "sha256=bad")).statusCode).toBe(401);
    const properties = body.replace("page.content_updated", "page.properties_updated");
    expect(
      (
        await send(
          properties,
          await signWebhookPayload({ body: properties, verificationToken: secret }),
        )
      ).json(),
    ).toEqual({ status: "ignored" });
    await repository.createManuscript({
      name: "Fixture",
      notionRootId: "11111111-1111-4111-8111-111111111111",
      notionRootType: "database",
      sources: [
        {
          notionPageId: "22222222-2222-4222-8222-222222222222",
          title: "Scene",
          included: true,
          sortOrder: 0,
        },
      ],
    });
    expect((await send()).json()).toEqual({ status: "queued" });
    expect((await send()).json()).toEqual({ status: "duplicate" });
    expect(await engine.store.pending()).toHaveLength(1);
    await server.close();
  });
  it("keeps configuration and manuscript APIs off the public listener", async () => {
    const { buildPublicServer } = await import("./publicServer.js");
    const server = buildPublicServer(
      createSyncEngine(new MemoryRepository(), new FixtureNotionClient()),
    );
    expect((await server.inject("/api/manuscripts")).statusCode).toBe(404);
    expect((await server.inject("/api/embed/invalid")).statusCode).toBe(404);
    expect((await server.inject("/embed/invalid")).statusCode).toBe(404);
    await server.close();
  });
});
