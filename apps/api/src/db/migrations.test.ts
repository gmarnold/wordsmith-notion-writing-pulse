import { PGlite } from "@electric-sql/pglite";
import { expect, it } from "vitest";
import { applyMigrations, loadMigrations, type Migration } from "./migrations.js";

it("applies production migrations deterministically, preserves legacy history and rejects altered SQL", async () => {
  const pg = new PGlite();
  const files = await loadMigrations();
  const apply = (migrations: Migration[]) =>
    pg.transaction((tx) =>
      applyMigrations(
        {
          query: async (text, parameters = []) => {
            if (parameters.length)
              return (await tx.query<Record<string, unknown>>(text, parameters)).rows;
            const result = await tx.exec(text);
            return (result.at(-1)?.rows ?? []) as Record<string, unknown>[];
          },
        },
        migrations,
        false,
      ),
    );
  try {
    await pg.exec(files[0]!.content);
    await pg.exec(
      "INSERT INTO manuscripts(id,name,notion_root_id,notion_root_type) VALUES ('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa','Fixture legacy','11111111-1111-4111-8111-111111111111','database')",
    );
    await apply(files);
    await apply(files);
    expect((await pg.query("SELECT * FROM wordsmith_migrations")).rows).toHaveLength(3);
    expect((await pg.query("SELECT name FROM manuscripts")).rows).toEqual([
      { name: "Fixture legacy" },
    ]);
    await expect(
      apply(files.map((f, i) => (i === 1 ? { ...f, content: f.content + "\nSELECT 1;" } : f))),
    ).rejects.toThrow("checksum mismatch");
    await expect(
      apply([
        ...files,
        {
          name: "0003_failure_fixture.sql",
          content: "CREATE TABLE should_rollback(id int); INVALID SQL;",
        },
      ]),
    ).rejects.toThrow();
    expect((await pg.query("SELECT to_regclass('public.should_rollback') AS name")).rows).toEqual([
      { name: null },
    ]);
    expect((await pg.query("SELECT * FROM wordsmith_migrations")).rows).toHaveLength(3);
  } finally {
    await pg.close();
  }
}, 20000);
