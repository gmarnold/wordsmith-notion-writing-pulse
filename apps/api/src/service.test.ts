import { beforeAll, describe, expect, it, vi } from "vitest";

beforeAll(() => {
  vi.stubEnv("WORDSMITH_DEMO_MODE", "true");
  vi.stubEnv("NOTION_TOKEN", "");
  vi.stubEnv("DATABASE_URL", "postgresql://wordsmith:wordsmith@localhost:5432/wordsmith");
});

describe("sync history", () => {
  it("saves snapshots and returns stats", async () => {
    const { createWordsmithService } = await import("./service.js");
    const { MemoryRepository } = await import("./repository.js");
    const service = createWordsmithService(new MemoryRepository());
    const inspected = await service.inspect({ notionUrlOrId: "11111111-1111-4111-8111-111111111111" });
    const manuscript = await service.createManuscript({
      name: inspected.name,
      notionRootId: inspected.notionRootId,
      notionRootType: inspected.notionRootType,
      sources: inspected.sources.map((source) => ({
        notionPageId: source.notionPageId,
        title: source.title,
        included: source.included,
        sortOrder: source.sortOrder
      }))
    });
    const stats = await service.sync(manuscript.id);
    expect(stats?.totalWords).toBeGreaterThan(0);
    expect(stats?.chapters).toHaveLength(3);
  });
});

