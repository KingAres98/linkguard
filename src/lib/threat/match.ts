import { parse } from "tldts";

// Treat platform domains such as github.io or pages.dev as public suffixes,
// so every site on them counts as a separate site.
const OPTIONS = { allowPrivateDomains: true } as const;

/**
 * The hostnames to look up for a scan target: the host itself, then each
 * parent, stopping at the registrable domain (never "com" or "co.uk").
 */
export function candidateHosts(hostname: string): string[] {
  const host = hostname.trim().toLowerCase().replace(/\.$/, "");
  if (host === "") return [];

  const parsed = parse(host, OPTIONS);
  if (parsed.isIp) return [];

  const registrable = parsed.domain;
  if (!registrable) return [host];

  const labels = host.split(".");
  const registrableLabelCount = registrable.split(".").length;
  const result: string[] = [];
  for (let i = 0; i <= labels.length - registrableLabelCount; i++) {
    result.push(labels.slice(i).join("."));
  }
  return result;
}

/** True for "com", "co.uk", "github.io": names that many unrelated sites share. */
export function isPublicSuffix(host: string): boolean {
  const lower = host.toLowerCase();
  const parsed = parse(lower, OPTIONS);
  return parsed.domain === null && parsed.publicSuffix === lower;
}