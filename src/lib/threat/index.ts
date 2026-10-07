import {
  createSqliteThreatIndex,
  defaultThreatDbPath,
  openThreatDatabase,
} from "./sqlite-threat-index";
import type { ThreatIndex } from "./types";

// Same pattern as the scan store: one connection, kept across dev reloads.
const globalForIndex = globalThis as unknown as { __linkguardThreatIndex?: ThreatIndex };

export function getThreatIndex(): ThreatIndex {
  if (!globalForIndex.__linkguardThreatIndex) {
    globalForIndex.__linkguardThreatIndex = createSqliteThreatIndex(
      openThreatDatabase(defaultThreatDbPath()),
    );
  }
  return globalForIndex.__linkguardThreatIndex;
}

/** Lets tests swap in a different index. Not used by app code. */
export function setThreatIndexForTesting(index: ThreatIndex | undefined): void {
  globalForIndex.__linkguardThreatIndex = index;
}