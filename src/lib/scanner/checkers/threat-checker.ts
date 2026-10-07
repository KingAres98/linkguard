import { candidateHosts } from "@/lib/threat/match";
import { THREAT_SOURCES } from "@/lib/threat/refresh";
import type { SourceStatus, ThreatIndex } from "@/lib/threat/types";
import type { EvidenceItem, Finding } from "../types";

// Feed data older than this can't support a "not listed" statement.
const STALE_AFTER_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_MATCHES_SHOWN = 10;

interface HostMatch {
  /** The hostname from this scan that matched. */
  host: string;
  /** The feed entry it matched (the host itself or a parent domain). */
  matchedHost: string;
  source: string;
}

function sourceName(id: string): string {
  return THREAT_SOURCES.find((s) => s.id === id)?.name ?? id;
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`;
}

/**
 * The distinct hostnames involved in a scan: the one that was entered
 * first, then any redirect destinations. Unparseable URLs and bracketed
 * IPv6 literals are ignored.
 */
export function hostnamesFromUrls(startHostname: string, urls: readonly string[]): string[] {
  const result: string[] = [];
  const add = (host: string) => {
    const lower = host.trim().toLowerCase();
    if (lower !== "" && !lower.startsWith("[") && !result.includes(lower)) result.push(lower);
  };

  add(startHostname);
  for (const raw of urls) {
    try {
      add(new URL(raw).hostname);
    } catch {
      // A malformed URL just contributes no hostname.
    }
  }
  return result;
}

function unavailableFinding(reason: string, extra: EvidenceItem[] = []): Finding {
  return {
    id: "threat.unavailable",
    category: "threat",
    status: "unknown",
    severity: "info",
    title: "Threat feeds could not be checked",
    description: reason,
    whyItMatters:
      "Threat feeds list sites that others have already reported as phishing or malware. Without current feed data, this scan cannot say whether the site is on one.",
    recommendation: "",
    evidence: [{ label: "Reason", value: reason }, ...extra],
    confidence: "low",
    limitations:
      "No result here is not the same as 'not listed'. This scan simply could not look.",
  };
}

function listedFinding(
  hits: HostMatch[],
  status: SourceStatus[],
  scannedHost: string,
  checked: string[],
): Finding {
  const sources = [...new Set(hits.map((h) => h.source))];
  const names = sources.map(sourceName);
  const listedHosts = [...new Set(hits.map((h) => h.host))];
  const direct = listedHosts.includes(scannedHost);
  const viaParent = hits.some((h) => h.matchedHost !== h.host);

  const feeds = `${sources.length} threat ${plural(sources.length, "feed")}: ${names.join(", ")}`;
  const description = direct
    ? `${scannedHost} appears in ${feeds}.`
    : `The scanned address redirects to ${listedHosts.join(", ")}, which appears in ${feeds}.`;

  const evidence: EvidenceItem[] = [{ label: "Hostnames checked", value: checked.join(", ") }];
  hits.slice(0, MAX_MATCHES_SHOWN).forEach((hit, i) => {
    const parent =
      hit.matchedHost !== hit.host ? ` (listed as parent domain ${hit.matchedHost})` : "";
    evidence.push({
      label: `Match ${i + 1}`,
      value: `${hit.host}${parent}: ${sourceName(hit.source)}`,
    });
  });
  for (const source of sources) {
    const row = status.find((s) => s.source === source);
    if (row) evidence.push({ label: `Feed updated: ${sourceName(source)}`, value: row.updatedAt });
  }

  let limitations =
    "A listing means the feed's maintainers judged this host malicious at some point. It does not show what the page does right now, and feeds can contain mistakes or lag behind a site being cleaned up.";
  if (viaParent) {
    limitations +=
      " The listing is for a parent domain, so it describes that domain broadly rather than this exact page.";
  }

  return {
    id: "threat.listed",
    category: "threat",
    status: "fail",
    severity: "critical",
    title: "Hostname appears on a threat feed",
    description,
    whyItMatters:
      "Threat feeds are lists, kept by security researchers and volunteers, of sites seen hosting phishing pages or malware. A listing is a strong warning sign: pages on listed sites are often built to steal passwords or payment details.",
    recommendation:
      "Do not enter passwords, payment details or personal information on this site, and do not download or open files from it. If you think the listing is a mistake, ask the feed's maintainers to review it.",
    evidence,
    confidence: sources.length >= 2 ? "high" : "medium",
    limitations,
  };
}

function notListedFinding(status: SourceStatus[], checked: string[]): Finding {
  const names = status.map((s) => sourceName(s.source));
  const evidence: EvidenceItem[] = [{ label: "Hostnames checked", value: checked.join(", ") }];
  for (const row of status) {
    evidence.push({
      label: `Feed updated: ${sourceName(row.source)}`,
      value: `${row.updatedAt} (${row.entryCount.toLocaleString("en-US")} entries)`,
    });
  }

  return {
    id: "threat.not-listed",
    category: "threat",
    status: "info",
    severity: "info",
    title: "Not found on the threat feeds we checked",
    description: `None of the hostnames involved in this scan (${checked.join(", ")}) appear in ${status.length} threat ${plural(status.length, "feed")}: ${names.join(", ")}.`,
    whyItMatters:
      "Checking known-bad lists catches sites that other people have already found and reported as phishing or malware.",
    recommendation: "",
    evidence,
    confidence: "medium",
    limitations:
      "Not being listed does not mean a site is safe. Feeds only contain threats someone has already found and reported, and new malicious sites often take hours or days to appear. Treat this as one signal among many.",
  };
}

/**
 * Looks up every hostname involved in a scan (the first is the one that was
 * entered) in the local threat index. Failure to look is reported as
 * "unknown", never as "not listed".
 */
export async function checkThreatIntel(
  getIndex: () => ThreatIndex,
  hostnames: readonly string[],
  now: () => Date = () => new Date(),
): Promise<Finding[]> {
  // The feeds list domain names, so IP-address targets are skipped.
  const checkable = hostnames.filter((h) => candidateHosts(h).length > 0);
  if (checkable.length === 0) return [];

  let status: SourceStatus[];
  const hits: HostMatch[] = [];
  try {
    const index = getIndex();
    status = await index.getStatus();
    for (const host of checkable) {
      for (const match of await index.lookup(host)) {
        hits.push({ host, matchedHost: match.matchedHost, source: match.source });
      }
    }
  } catch {
    // The error text is not shown: it could reveal file paths.
    return [unavailableFinding("The threat feed database could not be read.")];
  }

  // A listing is evidence even when the feed data is old.
  if (hits.length > 0) return [listedFinding(hits, status, checkable[0], checkable)];

  if (status.length === 0) {
    return [
      unavailableFinding("No threat feed data has been downloaded on this server yet.", [
        { label: "For the operator", value: "Run: npm run threat:update" },
      ]),
    ];
  }

  const oldest = Math.min(...status.map((s) => Date.parse(s.updatedAt)));
  if (Number.isNaN(oldest) || now().getTime() - oldest > STALE_AFTER_MS) {
    return [
      unavailableFinding("The threat feed data on this server is out of date.", [
        {
          label: "Feed last updated",
          value: Number.isNaN(oldest) ? "unknown" : new Date(oldest).toISOString(),
        },
        { label: "For the operator", value: "Run: npm run threat:update" },
      ]),
    ];
  }

  return [notListedFinding(status, checkable)];
}