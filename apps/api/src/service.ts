import { Client } from "@notionhq/client";
import {
  FixtureNotionClient,
  OfficialNotionBlockClient,
  countPageWords,
  demoRootId,
  inferRootType,
  inspectManuscriptSource,
  normalizeNotionId
} from "@wordsmith/notion";
import { createManuscriptRequestSchema, inspectRequestSchema } from "@wordsmith/shared";
import { config, notionTokenStatus } from "./config.js";
import { ApiProblem } from "./problems.js";
import type { Repository } from "./repository.js";

export function createWordsmithService(repository: Repository) {
  const notionClient = config.WORDSMITH_DEMO_MODE || !config.NOTION_TOKEN ? new FixtureNotionClient() : new OfficialNotionBlockClient(config.NOTION_TOKEN);

  return {
    async notionStatus() {
      if (config.WORDSMITH_DEMO_MODE) {
        return { configured: true, mode: "demo", reachable: true, workspaceName: "Demo workspace" };
      }
      if (notionTokenStatus() === "missing") {
        return { configured: false, mode: "notion", reachable: false, message: "Add NOTION_TOKEN to apps/api/.env." };
      }
      try {
        const client = new Client({ auth: config.NOTION_TOKEN, notionVersion: "2026-03-11" });
        const response = await client.users.me({});
        return { configured: true, mode: "notion", reachable: true, workspaceName: safeBotName(response) };
      } catch {
        return { configured: true, mode: "notion", reachable: false, message: "The Notion token is invalid or Notion is unavailable." };
      }
    },

    async inspect(raw: unknown) {
      const request = inspectRequestSchema.parse(raw);
      let rootId: string;
      try {
        rootId = config.WORDSMITH_DEMO_MODE ? demoRootId : normalizeNotionId(request.notionUrlOrId);
      } catch {
        throw new ApiProblem(400, "INVALID_NOTION_ID", "Paste a valid Notion page, database, or data source URL.");
      }
      const rootType = inferRootType(request.notionUrlOrId);
      let sources;
      try {
        sources = await inspectManuscriptSource(notionClient, rootId, rootType);
      } catch {
        throw new ApiProblem(403, "NOTION_SOURCE_INACCESSIBLE", "Wordsmith is connected to Notion, but this page or database has not been shared with the connection, or the pasted URL points to an inaccessible view/source.");
      }

      const sourcesWithCounts = [];
      const countFailures: string[] = [];
      for (const source of sources) {
        try {
          sourcesWithCounts.push({ ...source, wordCount: await countPageWords(notionClient, source.notionPageId) });
        } catch {
          countFailures.push(source.title);
        }
      }

      if (countFailures.length > 0) {
        throw new ApiProblem(
          403,
          "NOTION_PAGE_COUNT_FAILED",
          `Wordsmith found the manuscript source, but could not read ${countFailures.length === 1 ? "this page" : "these pages"}: ${countFailures.join(", ")}. Share the page or its parent with the Wordsmith connection, then try again.`
        );
      }

      return {
        name: config.WORDSMITH_DEMO_MODE ? "Demo Manuscript" : "Notion manuscript",
        notionRootId: rootId,
        notionRootType: rootType,
        sources: sourcesWithCounts,
        totalWords: sourcesWithCounts.reduce((sum, source) => sum + (source.wordCount ?? 0), 0)
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

    async sync(manuscriptId: string) {
      const manuscript = await repository.getManuscript(manuscriptId);
      if (!manuscript) return null;
      const run = await repository.createSyncRun(manuscriptId);
      const errors: string[] = [];
      for (const source of manuscript.sources.filter((item) => item.included)) {
        try {
          const wordCount = await countPageWords(notionClient, source.notionPageId);
          await repository.saveSnapshot({ syncRunId: run.id, manuscriptId, sourceId: source.id, wordCount });
        } catch {
          errors.push(source.title);
        }
      }
      const status = errors.length === 0 ? "success" : errors.length < manuscript.sources.length ? "partial_failure" : "failed";
      await repository.completeSyncRun(run.id, status, errors.length > 0 ? `Could not sync: ${errors.join(", ")}` : undefined);
      return repository.getStats(manuscriptId);
    },

    async stats(manuscriptId: string) {
      return repository.getStats(manuscriptId);
    }
  };
}

function safeBotName(response: unknown): string | null {
  const maybe = response as { name?: string; bot?: { workspace_name?: string } };
  return maybe.bot?.workspace_name ?? maybe.name ?? null;
}

export type WordsmithService = ReturnType<typeof createWordsmithService>;
