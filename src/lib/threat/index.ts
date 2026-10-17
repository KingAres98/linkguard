import {
  createSqliteThreatIndex,
  defaultThreatDbPath,
  openThreatDatabase,
  openThreatDatabaseReadOnly,
} from "./sqlite-threat-index";
import type { ThreatIndex } from "./types";

// Same pattern as the scan store: one connection, kept across dev reloads.
const globalForIndex = globalThis as unknown as { __linkguardThreatIndex?: ThreatIndex };

/**
 * Should the threat database be opened read-only?
 *
 * Some hosts (Vercel, for example) run the app from a read-only disk. There
 * the database was built during deployment and shipped with the code, and the
 * normal opener would fail trying to switch it to WAL mode.
 *
 * - LINKGUARD_THREAT_DB_READONLY=true or false forces the choice.
 * - Otherwise Vercel is detected through the VERCEL variable it sets itself,
 *   so a forgotten setting cannot break a deployment.
 */
export function shouldOpenReadOnly(
  env: Record<string, string | undefined> = process.env,
): boolean {
  const setting = env.LINKGUARD_THREAT_DB_READONLY;
  if (setting === "true") return true;
  if (setting === "false") return false;
  return Boolean(env.VERCEL);
}

export function getThreatIndex(): ThreatIndex {
  if (!globalForIndex.__linkguardThreatIndex) {
    const path = defaultThreatDbPath();
    // If opening throws, nothing is stored, so the next call tries again.
    const db = shouldOpenReadOnly()
      ? openThreatDatabaseReadOnly(path)
      : openThreatDatabase(path);
    globalForIndex.__linkguardThreatIndex = createSqliteThreatIndex(db);
  }
  return globalForIndex.__linkguardThreatIndex;
}

/** Lets tests swap in a different index. Not used by app code. */
export function setThreatIndexForTesting(index: ThreatIndex | undefined): void {
  globalForIndex.__linkguardThreatIndex = index;
}