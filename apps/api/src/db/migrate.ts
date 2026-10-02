import postgres from "postgres";
import { readFile } from "node:fs/promises";
import { config } from "../config.js";
if (!config.DATABASE_URL) throw new Error("DATABASE_URL is required for migrations");
const sql = postgres(config.DATABASE_URL, { max: 1 });
try {
  await sql.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(872435)`;
    await tx`CREATE TABLE IF NOT EXISTS wordsmith_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())`;
    for (const name of ["0000_initial.sql", "0001_sync_foundation.sql"]) {
      if ((await tx`SELECT name FROM wordsmith_migrations WHERE name=${name}`).length) continue;
      const existing = await tx`SELECT to_regclass('public.manuscripts') AS table_name`;
      if (name !== "0000_initial.sql" || !existing[0]?.table_name)
        await tx.unsafe(await readFile(new URL(`../../drizzle/${name}`, import.meta.url), "utf8"));
      await tx`INSERT INTO wordsmith_migrations(name) VALUES (${name})`;
    }
  });
  console.log("Wordsmith migrations applied.");
} finally {
  await sql.end();
}
