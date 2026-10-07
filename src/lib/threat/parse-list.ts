import { isPublicSuffix } from "./match";

export interface ParsedHostList {
  /** Unique, lowercase, validated hostnames. */
  hosts: string[];
  /** Lines that had content but were not usable hostnames. */
  skipped: number;
}

const LABEL = /^(?!-)[a-z0-9-]{1,63}(?<!-)$/;
const MAX_HOST_LENGTH = 253;
const MAX_LINE_LENGTH = 300;
// Addresses that hosts-file blocklists point names at.
const SINK_ADDRESSES = new Set(["0.0.0.0", "127.0.0.1", "127.0.1.1", "::", "::1"]);

function isValidHostname(host: string): boolean {
  if (host.length === 0 || host.length > MAX_HOST_LENGTH) return false;
  const labels = host.split(".");
  if (labels.length < 2) return false;
  if (!labels.every((label) => LABEL.test(label))) return false;
  // An all-numeric last label means an IPv4 address or junk, not a domain.
  return !/^\d+$/.test(labels[labels.length - 1]);
}

/**
 * Reads a list of hostnames: one per line, "#" comments, or hosts-file
 * style ("0.0.0.0 example.com"). The input is untrusted, so every line is
 * validated and anything odd is skipped and counted, never stored.
 */
export function parseHostList(text: string): ParsedHostList {
  const hosts = new Set<string>();
  let skipped = 0;

  for (const rawLine of text.split(/\r?\n/)) {
    if (rawLine.length > MAX_LINE_LENGTH) {
      skipped++;
      continue;
    }

    const line = rawLine.replace(/#.*$/, "").trim();
    if (line === "") continue; // blank or comment-only: nothing was lost

    const tokens = line.split(/\s+/);
    let candidate: string | undefined;
    if (tokens.length === 1) candidate = tokens[0];
    else if (tokens.length === 2 && SINK_ADDRESSES.has(tokens[0])) candidate = tokens[1];

    if (!candidate) {
      skipped++;
      continue;
    }

    const host = candidate.toLowerCase().replace(/\.$/, "");
    // A listed public suffix (such as "github.io") would flag every site under it.
    if (!isValidHostname(host) || isPublicSuffix(host)) {
      skipped++;
      continue;
    }
    hosts.add(host);
  }

  return { hosts: [...hosts], skipped };
}