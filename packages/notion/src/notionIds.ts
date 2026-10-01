import type { NotionRootType } from "@wordsmith/shared";

const uuidPattern =
  /[0-9a-fA-F]{8}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{4}-?[0-9a-fA-F]{12}/;

export function normalizeNotionId(input: string): string {
  const trimmed = input.trim();
  const match = trimmed.match(uuidPattern);
  if (!match) {
    throw new Error("No Notion page or database ID was found in that value.");
  }

  const compact = match[0].replaceAll("-", "").toLowerCase();
  return [
    compact.slice(0, 8),
    compact.slice(8, 12),
    compact.slice(12, 16),
    compact.slice(16, 20),
    compact.slice(20)
  ].join("-");
}

export function inferRootType(input: string): NotionRootType {
  return input.includes("?v=") || input.includes("/database/") ? "database" : "page";
}
