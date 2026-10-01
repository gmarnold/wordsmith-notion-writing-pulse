import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import { config } from "../config.js";
import * as schema from "./schema.js";

export function createDb() {
  if (!config.DATABASE_URL) {
    return null;
  }

  const client = postgres(config.DATABASE_URL, { max: 5 });
  return drizzle(client, { schema });
}

export type Db = NonNullable<ReturnType<typeof createDb>>;
