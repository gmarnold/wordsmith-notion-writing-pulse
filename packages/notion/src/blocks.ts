import { Client } from "@notionhq/client";
import type { NotionRootType } from "@wordsmith/shared";
import { countWords, extractCountableText, type CountableNotionBlock } from "./wordCount.js";

export interface NotionBlockClient {
  listBlockChildren(blockId: string, startCursor?: string): Promise<BlockChildrenPage>;
  retrievePage(pageId: string): Promise<NotionPage>;
  queryDatabase(databaseId: string, startCursor?: string): Promise<DatabaseQueryPage>;
}

export interface BlockChildrenPage {
  results: CountableNotionBlock[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface DatabaseQueryPage {
  results: NotionPage[];
  has_more: boolean;
  next_cursor: string | null;
}

export interface NotionPage {
  id: string;
  object: "page";
  properties?: Record<string, unknown>;
}

export interface ManuscriptCandidate {
  notionPageId: string;
  title: string;
  included: boolean;
  sortOrder: number | null;
  wordCount?: number;
}

export class OfficialNotionBlockClient implements NotionBlockClient {
  private readonly client: Client;
  private readonly dataSourceIdsByDatabaseId = new Map<string, string>();

  constructor(token: string) {
    this.client = new Client({ auth: token, notionVersion: "2026-03-11", logger: () => {} });
  }

  async listBlockChildren(blockId: string, startCursor?: string): Promise<BlockChildrenPage> {
    const response = await this.client.blocks.children.list({
      block_id: blockId,
      start_cursor: startCursor,
    });
    return response as BlockChildrenPage;
  }

  async retrievePage(pageId: string): Promise<NotionPage> {
    return (await this.client.pages.retrieve({ page_id: pageId })) as NotionPage;
  }

  async queryDatabase(databaseId: string, startCursor?: string): Promise<DatabaseQueryPage> {
    const dataSourceId = await this.resolveDataSourceId(databaseId);
    const response = await this.client.dataSources.query({
      data_source_id: dataSourceId,
      start_cursor: startCursor,
      result_type: "page",
    });
    return {
      results: response.results.filter(isNotionPage),
      has_more: response.has_more,
      next_cursor: response.next_cursor,
    };
  }

  async listProperties(rootId: string) {
    const id = await this.resolveDataSourceId(rootId);
    const source = await this.client.dataSources.retrieve({ data_source_id: id });
    if (!("properties" in source)) throw new Error("Data source unavailable");
    return Object.entries(source.properties).map(([name, p]) => ({ id: p.id, name, type: p.type }));
  }

  async updateProperties(
    pageId: string,
    properties: Parameters<Client["pages"]["update"]>[0]["properties"],
  ) {
    await this.client.pages.update({ page_id: pageId, properties });
  }

  private async resolveDataSourceId(databaseOrDataSourceId: string): Promise<string> {
    const cached = this.dataSourceIdsByDatabaseId.get(databaseOrDataSourceId);
    if (cached) return cached;

    try {
      const database = await this.client.databases.retrieve({
        database_id: databaseOrDataSourceId,
      });
      const dataSources = (database as { data_sources?: Array<{ id: string }> }).data_sources ?? [];
      const firstDataSourceId = dataSources[0]?.id;
      if (firstDataSourceId) {
        this.dataSourceIdsByDatabaseId.set(databaseOrDataSourceId, firstDataSourceId);
        return firstDataSourceId;
      }
    } catch {
      // The pasted ID may already be a data source ID. Try querying it directly.
    }

    return databaseOrDataSourceId;
  }
}

export async function getAllBlockChildren(
  client: NotionBlockClient,
  blockId: string,
): Promise<CountableNotionBlock[]> {
  const blocks: CountableNotionBlock[] = [];
  let cursor: string | undefined;

  do {
    const page = await client.listBlockChildren(blockId, cursor);
    blocks.push(...page.results);
    cursor = page.next_cursor ?? undefined;
    if (!page.has_more) {
      cursor = undefined;
    }
  } while (cursor);

  return blocks;
}

export async function countPageWords(client: NotionBlockClient, pageId: string): Promise<number> {
  let total = 0;
  const blocks = await getAllBlockChildren(client, pageId);

  for (const block of blocks) {
    total += countWords(extractCountableText(block));
    if ((block as { has_children?: boolean }).has_children) {
      total += await countPageWords(client, (block as { id?: string }).id ?? pageId);
    }
  }

  return total;
}

export async function inspectManuscriptSource(
  client: NotionBlockClient,
  rootId: string,
  rootType: NotionRootType,
): Promise<ManuscriptCandidate[]> {
  if (rootType === "database") {
    const pages = await getAllDatabasePages(client, rootId);
    return pages.map((page, index) => ({
      notionPageId: page.id,
      title: getPageTitle(page) || `Page ${index + 1}`,
      included: true,
      sortOrder: index,
    }));
  }

  const children = await getAllBlockChildren(client, rootId);
  const childPages = children
    .filter((block) => block.type === "child_page")
    .map((block, index) => ({
      notionPageId: (block as { id?: string }).id ?? "",
      title:
        (block.child_page as { title?: string } | undefined)?.title?.trim() || `Page ${index + 1}`,
      included: true,
      sortOrder: index,
    }))
    .filter((source) => source.notionPageId.length > 0);

  if (childPages.length > 0) {
    return childPages;
  }

  const rootPage = await client.retrievePage(rootId);
  return [
    {
      notionPageId: rootId,
      title: getPageTitle(rootPage) || "Untitled manuscript page",
      included: true,
      sortOrder: 0,
    },
  ];
}

async function getAllDatabasePages(
  client: NotionBlockClient,
  databaseId: string,
): Promise<NotionPage[]> {
  const pages: NotionPage[] = [];
  let cursor: string | undefined;

  do {
    const page = await client.queryDatabase(databaseId, cursor);
    pages.push(...page.results);
    cursor = page.next_cursor ?? undefined;
    if (!page.has_more) {
      cursor = undefined;
    }
  } while (cursor);

  return pages;
}

export function getPageTitle(page: NotionPage): string {
  const properties = page.properties ?? {};
  for (const property of Object.values(properties)) {
    const maybeTitle = property as { type?: string; title?: Array<{ plain_text?: string }> };
    if (maybeTitle.type === "title") {
      return (
        maybeTitle.title
          ?.map((span) => span.plain_text ?? "")
          .join("")
          .trim() ?? ""
      );
    }
  }
  return "";
}

function isNotionPage(value: unknown): value is NotionPage {
  return (value as { object?: string }).object === "page";
}
