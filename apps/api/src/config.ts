import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import dotenv from "dotenv";
import { parseConfig } from "./environment.js";
// Hosted/test execution never loads a developer's local credentials.
const shellEnv = { ...process.env };
const local =
  shellEnv.NODE_ENV === "production" || shellEnv.NODE_ENV === "test" || shellEnv.VITEST
    ? {}
    : {
        ...dotenv.config().parsed,
        ...dotenv.config({ path: resolve(dirname(fileURLToPath(import.meta.url)), "../.env") })
          .parsed,
      };
export const config = parseConfig({ ...local, ...shellEnv });
export function notionTokenStatus() {
  return config.NOTION_TOKEN?.trim() ? "configured" : "missing";
}
