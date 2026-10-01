import "dotenv/config";
import { z } from "zod";

const envSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  NOTION_TOKEN: z.string().optional(),
  WORDSMITH_DEMO_MODE: z.coerce.boolean().default(false),
  API_PORT: z.coerce.number().int().positive().default(4141),
  WEB_ORIGIN: z.string().default("http://localhost:5173")
});

export const config = envSchema.parse(process.env);

export function notionTokenStatus(): "configured" | "missing" {
  return config.NOTION_TOKEN && config.NOTION_TOKEN.trim().length > 0 ? "configured" : "missing";
}
