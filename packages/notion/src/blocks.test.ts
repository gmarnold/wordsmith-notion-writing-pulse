import { describe, expect, it } from "vitest";
import { countPageWords, getAllBlockChildren, inspectManuscriptSource } from "./blocks.js";
import { FixtureNotionClient, demoRootId } from "./fixtures.js";

describe("Notion traversal", () => {
  it("handles paginated child block responses", async () => {
    const client = new FixtureNotionClient();
    const blocks = await getAllBlockChildren(client, demoRootId);
    expect(blocks).toHaveLength(3);
  });

  it("discovers child-page manuscript sources", async () => {
    const client = new FixtureNotionClient();
    const sources = await inspectManuscriptSource(client, demoRootId, "page");
    expect(sources.map((source) => source.title)).toEqual([
      "Chapter 1: The Lantern Room",
      "Chapter 2: Ink and Weather",
      "Chapter 3: A Door in the Margin"
    ]);
  });

  it("counts page prose without including child page titles", async () => {
    const client = new FixtureNotionClient();
    const sources = await inspectManuscriptSource(client, demoRootId, "page");
    const count = await countPageWords(client, sources[0]!.notionPageId);
    expect(count).toBe(26);
  });
});

