export type OperationalLogger = (fields: Record<string, unknown>, message: string) => void;
export function errorCategory(error: unknown, fallback = "SYNC") {
  const wrapped = error as { cause?: unknown };
  const e = (wrapped?.cause ?? error) as { code?: string; status?: number };
  if (e?.status === 401 || e?.code === "unauthorized") return "NOTION_AUTH";
  if (e?.status === 429 || e?.code === "rate_limited") return "NOTION_RATE_LIMIT";
  if (e?.status === 403 || e?.status === 404 || e?.code === "object_not_found")
    return "NOTION_PAGE_ACCESS";
  if (e?.code === "PROPERTY_MAPPING") return "CONFIGURATION";
  if (/^[0-9A-Z]{5}$/.test(e?.code ?? "")) return "DATABASE";
  return fallback;
}
