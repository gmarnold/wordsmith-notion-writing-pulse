import { and, eq, inArray, lte, sql } from "drizzle-orm";
import type { Settings } from "@wordsmith/shared";
import type { Db } from "./db/client.js";
import { manuscriptSettings, webhookEvents } from "./db/syncSchema.js";
import { defaultSettings } from "./analytics.js";
export type InboxEvent = {
  id: string;
  pageId: string;
  receivedAt: Date;
  availableAt: Date;
  status: string;
  attempts: number;
};
export class SyncStore {
  private settings = new Map<string, { settings: Settings; embedHash: string | null }>();
  private events = new Map<string, InboxEvent>();
  constructor(private db: Db | null = null) {}
  async getSettings(id: string) {
    return (await this.getConfig(id))?.settings ?? structuredClone(defaultSettings);
  }
  async getConfig(id: string) {
    return this.db
      ? (
          await this.db
            .select()
            .from(manuscriptSettings)
            .where(eq(manuscriptSettings.manuscriptId, id))
        )[0]
      : this.settings.get(id);
  }
  async saveSettings(id: string, settings: Settings) {
    if (this.db)
      await this.db
        .insert(manuscriptSettings)
        .values({ manuscriptId: id, settings })
        .onConflictDoUpdate({ target: manuscriptSettings.manuscriptId, set: { settings } });
    else this.settings.set(id, { settings, embedHash: this.settings.get(id)?.embedHash ?? null });
  }
  async setEmbed(id: string, embedHash: string | null) {
    if (this.db)
      await this.db
        .insert(manuscriptSettings)
        .values({ manuscriptId: id, settings: structuredClone(defaultSettings), embedHash })
        .onConflictDoUpdate({ target: manuscriptSettings.manuscriptId, set: { embedHash } });
    else
      this.settings.set(id, {
        settings: this.settings.get(id)?.settings ?? structuredClone(defaultSettings),
        embedHash,
      });
  }
  async findEmbed(hash: string) {
    if (this.db)
      return (
        (
          await this.db
            .select()
            .from(manuscriptSettings)
            .where(eq(manuscriptSettings.embedHash, hash))
        )[0]?.manuscriptId ?? null
      );
    return [...this.settings.entries()].find(([, s]) => s.embedHash === hash)?.[0] ?? null;
  }
  async enqueue(id: string, pageId: string, now = new Date()) {
    const event: InboxEvent = {
      id,
      pageId,
      receivedAt: now,
      availableAt: new Date(+now + 3000),
      status: "pending",
      attempts: 0,
    };
    if (this.db)
      return (
        (await this.db.insert(webhookEvents).values(event).onConflictDoNothing().returning())
          .length > 0
      );
    if (this.events.has(id)) return false;
    this.events.set(id, event);
    return true;
  }
  async pending() {
    return this.db
      ? this.db.select().from(webhookEvents).where(eq(webhookEvents.status, "pending"))
      : [...this.events.values()].filter((e) => e.status === "pending");
  }
  async finish(ids: string[], success: boolean, now = new Date()) {
    if (!ids.length) return;
    const update = { status: success ? "done" : "pending", availableAt: new Date(+now + 30000) };
    if (this.db)
      await this.db
        .update(webhookEvents)
        .set({ ...update, attempts: sql`${webhookEvents.attempts} + 1` })
        .where(inArray(webhookEvents.id, ids));
    else
      for (const id of ids)
        Object.assign(this.events.get(id)!, update, {
          attempts: this.events.get(id)!.attempts + 1,
        });
  }
  async prune(now = new Date()) {
    const cutoff = new Date(+now - 30 * 86400000);
    if (this.db)
      await this.db
        .delete(webhookEvents)
        .where(and(eq(webhookEvents.status, "done"), lte(webhookEvents.receivedAt, cutoff)));
    else
      for (const [id, e] of this.events)
        if (e.status === "done" && e.receivedAt < cutoff) this.events.delete(id);
  }
}
