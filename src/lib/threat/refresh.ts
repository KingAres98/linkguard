import { parseHostList } from "./parse-list";
import type { ThreatIndex } from "./types";

/** How a feed is described in code. Its download URL is resolved at run time. */
export interface ThreatSourceDefinition {
  id: string;
  name: string;
  /** A fixed public URL. */
  url?: string;
  /** Or the name of an environment variable holding the URL, for URLs that contain a private key. */
  urlEnvVar?: string;
  /** Fewer usable entries than this means the download is broken, not the feed. */
  minEntries: number;
}

/** A feed with its download URL resolved. */
export interface ThreatSource {
  id: string;
  name: string;
  url: string;
  minEntries: number;
}

export const THREAT_SOURCES: readonly ThreatSourceDefinition[] = [
  {
    id: "phishing-database",
    name: "Phishing.Database (active phishing domains)",
    url: "https://raw.githubusercontent.com/Phishing-Database/Phishing.Database/master/phishing-domains-ACTIVE.txt",
    minEntries: 500,
  },
  {
    id: "urlhaus",
    name: "URLhaus (active malware distribution hosts)",
    urlEnvVar: "URLHAUS_HOSTFILE_URL",
    minEntries: 50,
  },
];

/**
 * Turns a definition into a downloadable source, or null if it is not
 * configured. Only https:// URLs are accepted.
 */
export function resolveSource(
  definition: ThreatSourceDefinition,
  env: Record<string, string | undefined>,
): ThreatSource | null {
  const raw = definition.url ?? (definition.urlEnvVar ? env[definition.urlEnvVar]?.trim() : undefined);
  if (!raw) return null;

  try {
    if (new URL(raw).protocol !== "https:") return null;
  } catch {
    return null;
  }

  return { id: definition.id, name: definition.name, url: raw, minEntries: definition.minEntries };
}

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
    const message = error instanceof Error ? error.message : "Download failed.";
    return {
      ok: false,
      source: source.id,
      // The URL may contain a private key, so it is never repeated in errors.
      error: message.split(source.url).join("[download URL hidden]"),
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