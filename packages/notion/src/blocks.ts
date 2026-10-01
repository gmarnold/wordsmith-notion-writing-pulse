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

  constructor(token: string) {
    this.client = new Client({ auth: token });
  }

  async listBlockChildren(blockId: string, startCursor?: string): Promise<BlockChildrenPage> {
    const response = await this.client.blocks.children.list({
      block_id: blockId,
      start_cursor: startCursor
    });
    return response as BlockChildrenPage;
  }

  async retrievePage(pageId: string): Promise<NotionPage> {
    return (await this.client.pages.retrieve({ page_id: pageId })) as NotionPage;
  }

  async queryDatabase(databaseId: string, startCursor?: string): Promise<DatabaseQueryPage> {
    const response = await this.client.databases.query({
      database_id: databaseId,
      start_cursor: startCursor
    });
    return response as DatabaseQueryPage;
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
      sortOrder: index
    }));
  }

  const children = await getAllBlockChildren(client, rootId);
  return children
    .filter((block) => block.type === "child_page")
    .map((block, index) => ({
      notionPageId: (block as { id?: string }).id ?? "",
      title:
        ((block.child_page as { title?: string } | undefined)?.title?.trim() || `Page ${index + 1}`),
      included: true,
      sortOrder: index
    }))
    .filter((source) => source.notionPageId.length > 0);
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
      return maybeTitle.title?.map((span) => span.plain_text ?? "").join("").trim() ?? "";
    }
  }
  return "";
}
