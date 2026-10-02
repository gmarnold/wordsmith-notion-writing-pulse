import type { Db } from "./client.js";
export async function withDatabaseSyncLock<T>(db: Db, fn: () => Promise<T>): Promise<T> {
  return (await db.$client.begin(async (tx) => {
    await tx`SELECT pg_advisory_xact_lock(872436)`;
    return fn();
  })) as T;
}
