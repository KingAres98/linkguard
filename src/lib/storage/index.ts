import { createSqliteStore, openDatabase } from "./sqlite-store";
import type { ScanStore } from "./types";

/** The single fixed owner, until accounts exist. */
export const LOCAL_OWNER_ID = "local";

// Next.js's dev server reloads modules often. Caching on globalThis keeps
// one database connection instead of opening a new one on every reload.
const globalForStore = globalThis as unknown as { __linkguardStore?: ScanStore };

export function getStore(): ScanStore {
  if (!globalForStore.__linkguardStore) {
    const path = process.env.LINKGUARD_DB_PATH ?? "data/linkguard.db";
    globalForStore.__linkguardStore = createSqliteStore(openDatabase(path));
  }
  return globalForStore.__linkguardStore;
}

/** Lets tests swap in an in-memory store. Not used by app code. */
export function setStoreForTesting(store: ScanStore | undefined): void {
  globalForStore.__linkguardStore = store;
}