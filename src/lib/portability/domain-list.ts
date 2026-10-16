import { parse as parseHostname } from "tldts";
import { parseDomainInput } from "@/lib/dashboard/parse-domain";
import { BACKUP_FORMAT } from "./backup";

export const MAX_LIST_BYTES = 1024 * 1024;
const MAX_FOUND = 1000; // stop collecting after this many unique domains
const MAX_LINES = 20000;
const MAX_JSON_NODES = 50000;

export type DomainListResult =
  | {
      ok: true;
      format: "text" | "csv" | "json";
      /** Unique, normalized hostnames in file order (up to MAX_FOUND). */
      domains: string[];
      /** Lines or entries that contained no usable domain. */
      skipped: number;
      /** True if the file had more than MAX_FOUND unique domains. */
      truncated: boolean;
    }
  | { ok: false; error: string };

const COMMENT_LINE = /^\s*(#|!|\/\/|;)/;
const HEADER_NAMES = [
  "domain",
  "domains",
  "domain name",
  "domainname",
  "hostname",
  "host",
  "url",
  "website",
  "site",
  "address",
  "fqdn",
];
const JSON_KEYS = [
  "domain",
  "domains",
  "hostname",
  "hostnames",
  "host",
  "hosts",
  "url",
  "urls",
  "website",
  "site",
  "sites",
  "address",
  "fqdn",
  "name",
  "items",
  "data",
  "list",
  "entries",
];

function isIpLike(token: string): boolean {
  return (
    /^\d{1,3}(\.\d{1,3}){3}$/.test(token) || (token.includes(":") && !token.includes("."))
  );
}

/** Requires a real, known domain ending, so junk like "e.g" is dropped. */
function hasKnownSuffix(hostname: string): boolean {
  const parsed = parseHostname(hostname, { allowPrivateDomains: true });
  return parsed.domain !== null && (parsed.isIcann === true || parsed.isPrivate === true);
}

function cleanToken(raw: string): string {
  let token = raw.trim().replace(/^["'`(<[]+|["'`)>\],;.]+$/g, "");
  const adblock = /^\|\|([^^/$]+)/.exec(token); // ||example.com^
  if (adblock) token = adblock[1];
  return token.replace(/^\*\./, "").replace(/^\./, "");
}

/** Returns a normalized hostname, "ip" for IP addresses (ignored silently), or null. */
function tokenToHost(raw: string): string | "ip" | null {
  const token = cleanToken(raw);
  if (token === "") return null;
  if (isIpLike(token)) return "ip";
  const parsed = parseDomainInput({ hostname: token });
  if (!parsed.ok) return null;
  return hasKnownSuffix(parsed.hostname) ? parsed.hostname : null;
}

function hostsInText(text: string): string[] {
  const withoutComment = text.replace(/\s#.*$/, "");
  const hosts: string[] = [];
  for (const token of withoutComment.split(/[\s,;]+/)) {
    const host = tokenToHost(token);
    if (host !== null && host !== "ip") hosts.push(host);
  }
  return hosts;
}

function detectDelimiter(line: string): string {
  const counts = [",", ";", "\t"].map((d) => [d, line.split(d).length - 1] as const);
  counts.sort((a, b) => b[1] - a[1]);
  return counts[0][1] > 0 ? counts[0][0] : ",";
}

/** Quote-aware split of one CSV line. */
function splitCsvLine(line: string, delimiter: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (inQuotes) {
      if (char === '"' && line[i + 1] === '"') {
        current += '"';
        i++;
      } else if (char === '"') {
        inQuotes = false;
      } else {
        current += char;
      }
    } else if (char === '"') {
      inQuotes = true;
    } else if (char === delimiter) {
      cells.push(current);
      current = "";
    } else {
      current += char;
    }
  }
  cells.push(current);
  return cells;
}

function collectJsonStrings(value: unknown, out: string[], budget: { left: number }, depth = 0) {
  if (budget.left-- <= 0 || depth > 6) return;
  if (typeof value === "string") {
    out.push(value);
  } else if (Array.isArray(value)) {
    for (const item of value) collectJsonStrings(item, out, budget, depth + 1);
  } else if (typeof value === "object" && value !== null) {
    const record = value as Record<string, unknown>;
    for (const key of JSON_KEYS) {
      if (key in record) collectJsonStrings(record[key], out, budget, depth + 1);
    }
  }
}

class Collector {
  private found = new Set<string>();
  skipped = 0;
  truncated = false;

  add(host: string) {
    if (this.found.has(host)) return;
    if (this.found.size >= MAX_FOUND) {
      this.truncated = true;
      return;
    }
    this.found.add(host);
  }

  get domains(): string[] {
    return [...this.found];
  }
}

function usableLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .filter((line) => line.trim() !== "" && !COMMENT_LINE.test(line))
    .slice(0, MAX_LINES);
}

/**
 * Reads a domain list in whichever common format it arrives in: plain text,
 * hosts file, ad-blocker list, CSV/TSV with a header, JSON, or full URLs.
 * Everything is validated like the Add form; nothing in the file is trusted.
 */
export function parseDomainList(input: string): DomainListResult {
  if (new TextEncoder().encode(input).length > MAX_LIST_BYTES) {
    return { ok: false, error: "That file is too large to import (limit 1 MB)." };
  }

  const text = input.replace(/^\uFEFF/, "");
  const trimmed = text.trim();
  if (trimmed === "") {
    return { ok: false, error: "Nothing to import: the file is empty." };
  }

  const collector = new Collector();
  let format: "text" | "csv" | "json" = "text";

  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    let data: unknown;
    try {
      data = JSON.parse(trimmed);
    } catch {
      return { ok: false, error: "That file looks like JSON but could not be read." };
    }
    if (typeof data === "object" && data !== null && (data as { format?: unknown }).format === BACKUP_FORMAT) {
      return { ok: false, error: "That is a LinkGuard backup. Use Import backup instead." };
    }
    format = "json";
    const strings: string[] = [];
    collectJsonStrings(data, strings, { left: MAX_JSON_NODES });
    for (const value of strings) {
      const hosts = hostsInText(value);
      if (hosts.length === 0) collector.skipped++;
      for (const host of hosts) collector.add(host);
    }
  } else {
    const lines = usableLines(text);
    const delimiter = lines.length > 0 ? detectDelimiter(lines[0]) : ",";
    const header = lines.length > 0 ? splitCsvLine(lines[0], delimiter) : [];
    const column = header.findIndex((cell) => HEADER_NAMES.includes(cell.trim().toLowerCase()));

    if (column >= 0) {
      format = "csv";
      for (const line of lines.slice(1)) {
        const cell = splitCsvLine(line, delimiter)[column] ?? "";
        const host = tokenToHost(cell);
        if (host === null || host === "ip") collector.skipped++;
        else collector.add(host);
      }
    } else {
      for (const line of lines) {
        const hosts = hostsInText(line);
        if (hosts.length === 0) collector.skipped++;
        for (const host of hosts) collector.add(host);
      }
    }
  }

  const domains = collector.domains;
  if (domains.length === 0) {
    return { ok: false, error: "No valid domain names were found in that file." };
  }
  return { ok: true, format, domains, skipped: collector.skipped, truncated: collector.truncated };
}