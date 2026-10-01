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
        const client = new Client({ auth: config.NOTION_TOKEN });
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
        throw new ApiProblem(400, "INVALID_NOTION_ID", "Paste a valid Notion page or database URL.");
      }
      const rootType = inferRootType(request.notionUrlOrId);
      let sources;
      try {
        sources = await inspectManuscriptSource(notionClient, rootId, rootType);
      } catch {
        throw new ApiProblem(403, "NOTION_PAGE_INACCESSIBLE", "Wordsmith is connected to Notion, but this page has not been shared with the connection or is inaccessible.");
      }
      const sourcesWithCounts = await Promise.all(
        sources.map(async (source) => ({ ...source, wordCount: await countPageWords(notionClient, source.notionPageId) }))
      );
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
