import { Client } from "@notionhq/client";
import {
  FixtureNotionClient,
  OfficialNotionBlockClient,
  countPageWords,
  demoRootId,
  inferRootType,
  inspectManuscriptSource,
  normalizeNotionId,
} from "@wordsmith/notion";
import { createManuscriptRequestSchema, inspectRequestSchema } from "@wordsmith/shared";
import { createSyncEngine } from "./syncEngine.js";
import { SyncStore } from "./syncStore.js";
import { config, notionTokenStatus } from "./config.js";
import { ApiProblem } from "./problems.js";
import type { Repository } from "./repository.js";

export function createWordsmithService(repository: Repository, store = new SyncStore()) {
  const notionClient = config.WORDSMITH_DEMO_MODE
    ? new FixtureNotionClient()
    : new OfficialNotionBlockClient(config.NOTION_TOKEN ?? "");

  const engine = createSyncEngine(repository, notionClient, store);
  return {
    engine,
    async demoEdit(pageId: string) {
      if (!(notionClient instanceof FixtureNotionClient)) throw new Error("Demo only");
      const pageCount = await countPageWords(notionClient, pageId);
      notionClient.setWordCount(pageId, pageCount + 100);
      return engine.receive(crypto.randomUUID(), pageId);
    },
    async notionStatus() {
      if (config.WORDSMITH_DEMO_MODE) {
        return { configured: true, mode: "demo", reachable: true, workspaceName: "Demo workspace" };
      }
      if (notionTokenStatus() === "missing") {
        return {
          configured: false,
          mode: "notion",
          reachable: false,
          message: "Add NOTION_TOKEN to apps/api/.env.",
        };
      }
      try {
        const client = new Client({
          auth: config.NOTION_TOKEN,
          notionVersion: "2026-03-11",
          logger: () => {},
        });
        const response = await client.users.me({});
        return {
          configured: true,
          mode: "notion",
          reachable: true,
          workspaceName: safeBotName(response),
        };
      } catch {
        return {
          configured: true,
          mode: "notion",
          reachable: false,
          message: "The Notion token is invalid or Notion is unavailable.",
        };
      }
    },

    async inspect(raw: unknown) {
      const request = inspectRequestSchema.parse(raw);
      if (!config.WORDSMITH_DEMO_MODE && notionTokenStatus() === "missing")
        throw new ApiProblem(
          403,
          "NOTION_TOKEN_MISSING",
          "Add NOTION_TOKEN to apps/api/.env before inspecting a real manuscript.",
        );
      let rootId: string;
      try {
        rootId = config.WORDSMITH_DEMO_MODE ? demoRootId : normalizeNotionId(request.notionUrlOrId);
      } catch {
        throw new ApiProblem(
          400,
          "INVALID_NOTION_ID",
          "Paste a valid Notion page, database, or data source URL.",
        );
      }
      const rootType = inferRootType(request.notionUrlOrId);
      let sources;
      try {
        sources = await inspectManuscriptSource(notionClient, rootId, rootType);
      } catch {
        throw new ApiProblem(
          403,
          "NOTION_SOURCE_INACCESSIBLE",
          "Wordsmith is connected to Notion, but this page or database has not been shared with the connection, or the pasted URL points to an inaccessible view/source.",
        );
      }

      const sourcesWithCounts = [];
      const countFailures: string[] = [];
      for (const source of sources) {
        try {
          sourcesWithCounts.push({
            ...source,
            wordCount: await countPageWords(notionClient, source.notionPageId),
          });
        } catch {
          countFailures.push(source.title);
        }
      }

      if (countFailures.length > 0) {
        throw new ApiProblem(
          403,
          "NOTION_PAGE_COUNT_FAILED",
          `Wordsmith found the manuscript source, but could not read ${countFailures.length === 1 ? "this page" : "these pages"}: ${countFailures.join(", ")}. Share the page or its parent with the Wordsmith connection, then try again.`,
        );
      }

      return {
        name: config.WORDSMITH_DEMO_MODE ? "Demo Manuscript" : "Notion manuscript",
        notionRootId: rootId,
        notionRootType: rootType,
        sources: sourcesWithCounts,
        totalWords: sourcesWithCounts.reduce((sum, source) => sum + (source.wordCount ?? 0), 0),
      };
    },

    async createManuscript(raw: unknown) {
      const request = createManuscriptRequestSchema.parse(raw);
      return repository.createManuscript(request);
    },

    async listManuscripts() {
      return repository.listManuscripts();
    },

    async getManuscript(id: string) {
      return repository.getManuscript(id);
    },

    sync: engine.sync,
    stats: engine.stats,
  };
}
function safeBotName(response: unknown): string | null {
  const maybe = response as { name?: string; bot?: { workspace_name?: string } };
  return maybe.bot?.workspace_name ?? maybe.name ?? null;
}

export type WordsmithService = ReturnType<typeof createWordsmithService>;
