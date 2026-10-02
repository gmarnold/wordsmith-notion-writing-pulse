import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config.js";
import * as schema from "./schema.js";

export function createDb(runtime = config) {
  if (runtime.WORDSMITH_DEMO_MODE || !runtime.DATABASE_URL) {
    return null;
  }

  const client = postgres(runtime.DATABASE_URL, { max: 5, connect_timeout: 5 });
  return drizzle(client, { schema });
}

export type Db = NonNullable<ReturnType<typeof createDb>>;
