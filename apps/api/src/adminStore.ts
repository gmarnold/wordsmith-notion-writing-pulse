import { and, eq, gt, lte } from "drizzle-orm";
import type { Db } from "./db/client.js";
import { adminSessions, integrationState } from "./db/syncSchema.js";
export class AdminStore {
  constructor(private db: Db) {}
  async ensureIntegration() {
    await this.db.insert(integrationState).values({ id: "notion-internal" }).onConflictDoNothing();
  }
  async saveSession(hash: string, expiresAt: Date) {
    await this.db.delete(adminSessions).where(lte(adminSessions.expiresAt, new Date()));
    await this.db.insert(adminSessions).values({ tokenHash: hash, expiresAt });
  }
  async hasSession(hash: string) {
    return (
      (
        await this.db
          .select()
          .from(adminSessions)
          .where(and(eq(adminSessions.tokenHash, hash), gt(adminSessions.expiresAt, new Date())))
      ).length > 0
    );
  }
  async revokeSession(hash: string) {
    await this.db.delete(adminSessions).where(eq(adminSessions.tokenHash, hash));
  }
  async prepareSetup(nonceHash: string, expiresAt: Date) {
    await this.db
      .insert(integrationState)
      .values({ id: "notion-internal", setupNonceHash: nonceHash, setupExpiresAt: expiresAt })
      .onConflictDoUpdate({
        target: integrationState.id,
        set: { setupNonceHash: nonceHash, setupTokenCipher: null, setupExpiresAt: expiresAt },
      });
  }
  async captureSetup(nonceHash: string, cipher: string) {
    return (
      (
        await this.db
          .update(integrationState)
          .set({ setupTokenCipher: cipher, setupNonceHash: null })
          .where(
            and(
              eq(integrationState.id, "notion-internal"),
              eq(integrationState.setupNonceHash, nonceHash),
              gt(integrationState.setupExpiresAt, new Date()),
            ),
          )
          .returning()
      ).length > 0
    );
  }
  async setup() {
    return (
      await this.db
        .select()
        .from(integrationState)
        .where(eq(integrationState.id, "notion-internal"))
    )[0];
  }
  async clearSetup() {
    await this.db
      .update(integrationState)
      .set({ setupNonceHash: null, setupTokenCipher: null, setupExpiresAt: null })
      .where(eq(integrationState.id, "notion-internal"));
  }
  async workspace(name: string | null) {
    await this.db
      .insert(integrationState)
      .values({ id: "notion-internal", workspaceName: name })
      .onConflictDoUpdate({ target: integrationState.id, set: { workspaceName: name } });
  }
}
