import { parseHostList } from "./parse-list";
import type { ThreatIndex } from "./types";

export interface ThreatSource {
  id: string;
  name: string;
  url: string;
  /** Fewer usable entries than this means the download is broken, not the feed. */
  minEntries: number;
}

export const THREAT_SOURCES: readonly ThreatSource[] = [
  {
    id: "phishing-database",
    name: "Phishing.Database (active phishing domains)",
    url: "https://raw.githubusercontent.com/Phishing-Database/Phishing.Database/master/phishing-domains-ACTIVE.txt",
    minEntries: 500,
  },
];

// A refresh that keeps less than this share of the previous entries is rejected.
const MIN_RATIO = 0.5;

export type RefreshResult =
  | { ok: true; source: string; count: number; skipped: number }
  | { ok: false; source: string; error: string };

/**
 * Downloads one source and replaces its entries. If anything looks wrong,
 * the previous data stays in place: a bad download must never wipe a good index.
 */
export async function refreshSource(
  index: ThreatIndex,
  source: ThreatSource,
  download: (url: string) => Promise<string>,
  now: () => Date = () => new Date(),
): Promise<RefreshResult> {
  let text: string;
  try {
    text = await download(source.url);
  } catch (error) {
    return {
      ok: false,
      source: source.id,
      error: error instanceof Error ? error.message : "Download failed.",
    };
  }

  const { hosts, skipped } = parseHostList(text);

  if (hosts.length < source.minEntries) {
    return {
      ok: false,
      source: source.id,
      error: `Only ${hosts.length} usable entries (expected at least ${source.minEntries}). Keeping the previous data.`,
    };
  }

  const previous = (await index.getStatus()).find((s) => s.source === source.id);
  if (previous && hosts.length < previous.entryCount * MIN_RATIO) {
    return {
      ok: false,
      source: source.id,
      error: `Entry count dropped from ${previous.entryCount} to ${hosts.length}. Keeping the previous data.`,
    };
  }

  await index.replaceSource(source.id, hosts, now().toISOString());
  return { ok: true, source: source.id, count: hosts.length, skipped };
}