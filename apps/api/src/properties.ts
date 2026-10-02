import type { NotionBlockClient } from "@wordsmith/notion";
import type { Settings } from "@wordsmith/shared";
export type Property = { id: string; name: string; type: string };
export type WritingClient = NotionBlockClient & {
  listProperties(rootId: string): Promise<Property[]>;
  updateProperties(
    pageId: string,
    properties: Record<string, { number: number } | { date: { start: string } }>,
  ): Promise<void>;
};
export async function writeCount(
  client: WritingClient,
  pageId: string,
  count: number,
  settings: Settings,
  capturedAt: string,
) {
  if (!settings.wordCountPropertyId && !settings.lastCountedPropertyId) return false;
  const page = await client.retrievePage(pageId);
  const find = (id: string) =>
    Object.entries(page.properties ?? {}).find(([, p]) => (p as { id?: string }).id === id)?.[1] as
      { type?: string; number?: number; date?: { start: string } } | undefined;
  const patch: Record<string, { number: number } | { date: { start: string } }> = {};
  if (settings.wordCountPropertyId) {
    const p = find(settings.wordCountPropertyId);
    if (p?.type !== "number")
      throw Object.assign(new Error("Mapped Word Count property missing or wrong type"), {
        code: "PROPERTY_MAPPING",
      });
    if (p.number !== count) patch[settings.wordCountPropertyId] = { number: count };
  }
  if (settings.lastCountedPropertyId) {
    const p = find(settings.lastCountedPropertyId);
    if (p?.type !== "date")
      throw Object.assign(new Error("Mapped Last Counted property missing or wrong type"), {
        code: "PROPERTY_MAPPING",
      });
    if (!p.date?.start || +new Date(p.date.start) !== +new Date(capturedAt))
      patch[settings.lastCountedPropertyId] = { date: { start: capturedAt } };
  }
  if (Object.keys(patch).length) await client.updateProperties(pageId, patch);
  return Object.keys(patch).length > 0;
}
