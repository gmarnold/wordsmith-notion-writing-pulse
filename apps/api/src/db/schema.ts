import { boolean, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

export const manuscripts = pgTable("manuscripts", {
  id: uuid("id").primaryKey(),
  name: text("name").notNull(),
  notionRootId: text("notion_root_id").notNull(),
  notionRootType: text("notion_root_type").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const manuscriptSources = pgTable("manuscript_sources", {
  id: uuid("id").primaryKey(),
  manuscriptId: uuid("manuscript_id")
    .notNull()
    .references(() => manuscripts.id, { onDelete: "cascade" }),
  notionPageId: text("notion_page_id").notNull(),
  title: text("title").notNull(),
  included: boolean("included").notNull().default(true),
  sortOrder: integer("sort_order"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const syncRuns = pgTable("sync_runs", {
  id: uuid("id").primaryKey(),
  manuscriptId: uuid("manuscript_id")
    .notNull()
    .references(() => manuscripts.id, { onDelete: "cascade" }),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  completedAt: timestamp("completed_at", { withTimezone: true }),
  status: text("status").notNull(),
  errorSummary: text("error_summary"),
});

export const wordCountSnapshots = pgTable("word_count_snapshots", {
  id: uuid("id").primaryKey(),
  syncRunId: uuid("sync_run_id")
    .notNull()
    .references(() => syncRuns.id, { onDelete: "cascade" }),
  manuscriptId: uuid("manuscript_id")
    .notNull()
    .references(() => manuscripts.id, { onDelete: "cascade" }),
  sourceId: uuid("source_id")
    .notNull()
    .references(() => manuscriptSources.id, { onDelete: "cascade" }),
  wordCount: integer("word_count").notNull(),
  capturedAt: timestamp("captured_at", { withTimezone: true }).notNull().defaultNow(),
});

export { manuscriptSettings, webhookEvents } from "./syncSchema.js";
