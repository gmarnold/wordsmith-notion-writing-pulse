import type {
  NotionBlockClient,
  BlockChildrenPage,
  DatabaseQueryPage,
  NotionPage,
} from "./blocks.js";
import type { CountableNotionBlock } from "./wordCount.js";

const demoPageId = "11111111-1111-4111-8111-111111111111";
const chapterOneId = "22222222-2222-4222-8222-222222222222";
const chapterTwoId = "33333333-3333-4333-8333-333333333333";
const chapterThreeId = "44444444-4444-4444-8444-444444444444";

export const demoRootId = demoPageId;

export class FixtureNotionClient implements NotionBlockClient {
  private readonly pages: Record<string, CountableNotionBlock[]>;

  constructor() {
    this.pages = {
      [demoPageId]: [
        {
          id: chapterOneId,
          type: "child_page",
          child_page: { title: "Chapter 1: The Lantern Room" },
        },
        {
          id: chapterTwoId,
          type: "child_page",
          child_page: { title: "Chapter 2: Ink and Weather" },
        },
        {
          id: chapterThreeId,
          type: "child_page",
          child_page: { title: "Chapter 3: A Door in the Margin" },
        },
      ],
      [chapterOneId]: [
        paragraph("Mara found the lantern room after midnight, when the house was quiet."),
        paragraph("She didn't know why the glass still glowed, but she wrote it down anyway."),
      ],
      [chapterTwoId]: [
        heading("Rain Notes"),
        paragraph("The storm arrived in careful sentences, each one tapping the roof."),
        paragraph("Mother-in-law jokes would not help; neither would tea."),
      ],
      [chapterThreeId]: [
        paragraph("Hello-world was carved above the door."),
        paragraph("On the desk, three maps waited beside a blank page."),
      ],
    };
  }

  private properties: Record<string, Record<string, unknown>> = {};
  setWordCount(pageId: string, count: number) {
    this.pages[pageId] = [paragraph(Array(count).fill("word").join(" "))];
  }
  async listProperties() {
    return [
      { id: "wc", name: "Word Count", type: "number" },
      { id: "lc", name: "Last Counted", type: "date" },
    ];
  }
  async updateProperties(pageId: string, properties: Record<string, unknown> | undefined) {
    this.properties[pageId] = { ...this.properties[pageId] };
    for (const [id, value] of Object.entries(properties ?? {}))
      this.properties[pageId]![id] = {
        id,
        type: "number" in (value as object) ? "number" : "date",
        ...(value as object),
      };
  }
  async listBlockChildren(blockId: string, startCursor?: string): Promise<BlockChildrenPage> {
    const all = this.pages[blockId] ?? [];
    const start = startCursor ? Number(startCursor) : 0;
    const pageSize = 2;
    const results = all.slice(start, start + pageSize);
    const next = start + pageSize < all.length ? String(start + pageSize) : null;
    return {
      results,
      has_more: next !== null,
      next_cursor: next,
    };
  }

  async retrievePage(pageId: string): Promise<NotionPage> {
    return {
      id: pageId,
      object: "page",
      properties: {
        wc: { id: "wc", type: "number", number: null },
        lc: { id: "lc", type: "date", date: null },
        ...this.properties[pageId],
        Name: { type: "title", title: [{ plain_text: "Demo Manuscript" }] },
      },
    };
  }

  async queryDatabase(_databaseId: string, startCursor?: string): Promise<DatabaseQueryPage> {
    const pages: NotionPage[] = [
      notionPage(chapterOneId, "Chapter 1: The Lantern Room"),
      notionPage(chapterTwoId, "Chapter 2: Ink and Weather"),
      notionPage(chapterThreeId, "Chapter 3: A Door in the Margin"),
    ];
    const start = startCursor ? Number(startCursor) : 0;
    const results = pages.slice(start, start + 2);
    const next = start + 2 < pages.length ? String(start + 2) : null;
    return { results, has_more: next !== null, next_cursor: next };
  }
}

function paragraph(text: string): CountableNotionBlock {
  return { type: "paragraph", paragraph: { rich_text: [{ plain_text: text }] } };
}

function heading(text: string): CountableNotionBlock {
  return { type: "heading_2", heading_2: { rich_text: [{ plain_text: text }] } };
}

function notionPage(id: string, title: string): NotionPage {
  return {
    id,
    object: "page",
    properties: {
      Name: { type: "title", title: [{ plain_text: title }] },
    },
  };
}
