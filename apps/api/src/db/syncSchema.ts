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

export const adminSessions = pgTable("admin_sessions", {
  tokenHash: text("token_hash").primaryKey(),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
});
export const integrationState = pgTable("integration_state", {
  id: text("id").primaryKey(),
  kind: text("kind").notNull().default("internal_environment"),
  workspaceName: text("workspace_name"),
  setupNonceHash: text("setup_nonce_hash"),
  setupTokenCipher: text("setup_token_cipher"),
  setupExpiresAt: timestamp("setup_expires_at", { withTimezone: true }),
});
