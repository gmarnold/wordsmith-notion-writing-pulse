import { readFile, readdir } from "node:fs/promises";
import { createHash } from "node:crypto";

export type Migration = { name: string; content: string };
export type MigrationTransaction = {
  query: (text: string, parameters?: string[]) => Promise<Record<string, unknown>[]>;
};
export async function loadMigrations(): Promise<Migration[]> {
  const directory = new URL("../../drizzle/", import.meta.url);
  const files = (await readdir(directory)).filter((n) => /^\d{4}_[\w-]+\.sql$/.test(n)).sort();
  return Promise.all(
    files.map(async (name) => ({
      name,
      content: (await readFile(new URL(name, directory), "utf8"))
        .replace(/^\uFEFF/, "")
        .replaceAll("\r\n", "\n"),
    })),
  );
}
// The caller supplies one transaction covering every migration and its ledger entry.
export async function applyMigrations(
  tx: MigrationTransaction,
  files: Migration[],
  advisoryLock = true,
) {
  if (advisoryLock) await tx.query("SELECT pg_advisory_xact_lock(872435)");
  await tx.query(
    "CREATE TABLE IF NOT EXISTS wordsmith_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now(), checksum text)",
  );
  await tx.query("ALTER TABLE wordsmith_migrations ADD COLUMN IF NOT EXISTS checksum text");
  for (const { name, content } of files) {
    const checksum = createHash("sha256").update(content).digest("hex");
    const applied = await tx.query("SELECT checksum FROM wordsmith_migrations WHERE name=$1", [
      name,
    ]);
    if (applied.length) {
      if (applied[0]!.checksum && applied[0]!.checksum !== checksum)
        throw new Error("Migration checksum mismatch: " + name);
      if (!applied[0]!.checksum)
        await tx.query("UPDATE wordsmith_migrations SET checksum=$1 WHERE name=$2", [
          checksum,
          name,
        ]);
      continue;
    }
    const existing = await tx.query("SELECT to_regclass('public.manuscripts') AS table_name");
    if (name !== "0000_initial.sql" || !existing[0]?.table_name) await tx.query(content);
    await tx.query("INSERT INTO wordsmith_migrations(name,checksum) VALUES ($1,$2)", [
      name,
      checksum,
    ]);
  }
}
