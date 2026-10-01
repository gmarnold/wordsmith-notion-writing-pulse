export type CountableBlockType =
  | "paragraph"
  | "heading_1"
  | "heading_2"
  | "heading_3"
  | "quote"
  | "bulleted_list_item"
  | "numbered_list_item"
  | "callout";

export const countableBlockTypes = new Set<string>([
  "paragraph",
  "heading_1",
  "heading_2",
  "heading_3",
  "quote",
  "bulleted_list_item",
  "numbered_list_item",
  "callout"
]);

export const excludedBlockTypes = new Set<string>([
  "code",
  "equation",
  "bookmark",
  "embed",
  "image",
  "file",
  "pdf",
  "video",
  "audio",
  "link_preview",
  "child_page",
  "child_database",
  "table",
  "table_row",
  "synced_block",
  "template",
  "breadcrumb",
  "divider",
  "column",
  "column_list",
  "link_to_page",
  "table_of_contents"
]);

export interface RichTextSpan {
  plain_text?: string;
}

export interface CountableNotionBlock {
  type: string;
  [key: string]: unknown;
}

export function extractCountableText(block: CountableNotionBlock): string {
  if (!countableBlockTypes.has(block.type)) {
    return "";
  }

  const typed = block[block.type] as { rich_text?: RichTextSpan[] } | undefined;
  return typed?.rich_text?.map((span) => span.plain_text ?? "").join("") ?? "";
}

export function countWords(text: string): number {
  const normalized = text
    .normalize("NFC")
    .replace(/[\u2018\u2019]/gu, "'")
    .replace(/[\u2013\u2014]/gu, " ");

  const matches = normalized.match(/[\p{L}\p{N}]+(?:['-][\p{L}\p{N}]+)*/gu);
  return matches?.length ?? 0;
}

export function countRichTextWords(spans: RichTextSpan[]): number {
  return countWords(spans.map((span) => span.plain_text ?? "").join(""));
}
