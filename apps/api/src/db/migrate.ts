import postgres from "postgres";
import { applyMigrations, loadMigrations } from "./migrations.js";
import { config } from "../config.js";
if (!config.DATABASE_URL) throw new Error("DATABASE_URL is required for migrations");
const sql = postgres(config.DATABASE_URL, { max: 1, connect_timeout: 10 });
try {
  const files = await loadMigrations();
  await sql.begin(async (tx) => {
    await applyMigrations(
      { query: async (text, parameters = []) => tx.unsafe(text, parameters) },
      files,
    );
  });
  console.log("Wordsmith migrations applied.");
} catch {
  console.error(
    "DATABASE: migration failed; transaction rolled back. Check connectivity, permissions and migration checksums.",
  );
  process.exitCode = 1;
} finally {
  await sql.end();
}
