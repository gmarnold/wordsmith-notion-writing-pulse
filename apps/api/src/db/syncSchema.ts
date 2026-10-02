import { integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { manuscripts } from "./schema.js";
import type { Settings } from "@wordsmith/shared";
export const manuscriptSettings = pgTable("manuscript_settings", {
  manuscriptId: uuid("manuscript_id")
    .primaryKey()
    .references(() => manuscripts.id, { onDelete: "cascade" }),
  settings: jsonb("settings").$type<Settings>().notNull(),
  embedHash: text("embed_hash"),
});
export const webhookEvents = pgTable("webhook_events", {
  id: text("id").primaryKey(),
  pageId: text("page_id").notNull(),
  receivedAt: timestamp("received_at", { withTimezone: true }).notNull(),
  availableAt: timestamp("available_at", { withTimezone: true }).notNull(),
  status: text("status").notNull().default("pending"),
  attempts: integer("attempts").notNull().default(0),
});
