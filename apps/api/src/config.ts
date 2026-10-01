import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { z } from "zod";

const apiRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const shellEnv = { ...process.env };
dotenv.config();
const appEnv = process.env.VITEST ? {} : (dotenv.config({ path: resolve(apiRoot, ".env") }).parsed ?? {});
const mergedEnv = {
  ...process.env,
  ...appEnv,
  API_PORT: shellEnv.API_PORT ?? appEnv.API_PORT ?? process.env.API_PORT,
  WEB_ORIGIN: shellEnv.WEB_ORIGIN ?? appEnv.WEB_ORIGIN ?? process.env.WEB_ORIGIN
};

const booleanFromEnv = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  if (["true", "1", "yes", "on"].includes(value.toLowerCase())) return true;
  if (["false", "0", "no", "off", ""].includes(value.toLowerCase())) return false;
  return value;
}, z.boolean());

const envSchema = z.object({
  DATABASE_URL: z.string().url().optional(),
  NOTION_TOKEN: z.string().optional(),
  WORDSMITH_DEMO_MODE: booleanFromEnv.default(false),
  API_PORT: z.coerce.number().int().positive().default(4141),
  WEB_ORIGIN: z.string().default("http://localhost:5173")
});

export const config = envSchema.parse(mergedEnv);

export function notionTokenStatus(): "configured" | "missing" {
  return config.NOTION_TOKEN && config.NOTION_TOKEN.trim().length > 0 ? "configured" : "missing";
}
