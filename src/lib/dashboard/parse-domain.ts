import { normalizeUrl } from "@/lib/scanner/normalize-url";
import { parseScanRequest } from "@/lib/scanner/validate-input";

export const MAX_DOMAINS = 25;
const INVALID = "Enter a valid domain name, such as example.com.";

export type DomainParseResult =
  | { ok: true; hostname: string }
  | { ok: false; error: string };

/**
 * True for IP literals. The URL parser has already canonicalized obfuscated
 * forms (like 0x7f.1 or 2130706433) into dotted decimal, and IPv6 hostnames
 * always contain a colon, so these two checks are enough here. This file
 * runs in the browser too, so it can't use Node's net module.
 */
function looksLikeIpAddress(bare: string): boolean {
  return bare.includes(":") || /^\d{1,3}(\.\d{1,3}){3}$/.test(bare);
}

/** Validates a request body and reduces it to a bare, normalized hostname. */
export function parseDomainInput(body: unknown): DomainParseResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: INVALID };
  }

  // Reuse the scanner's length and control-character checks.
  const checked = parseScanRequest({ url: (body as Record<string, unknown>).hostname });
  if (!checked.ok) return { ok: false, error: INVALID };

  const normalized = normalizeUrl(checked.url);
  if (!normalized.ok) return { ok: false, error: INVALID };

  const hostname = normalized.url.hostname;
  const bare = hostname.replace(/^\[|\]$/g, "");

  // A tracked domain must be a real domain name: no IP addresses and no
  // single-label names like "localhost". Scans are SSRF-guarded regardless.
  if (looksLikeIpAddress(bare) || !hostname.includes(".")) {
    return { ok: false, error: INVALID };
  }

  return { ok: true, hostname };
}