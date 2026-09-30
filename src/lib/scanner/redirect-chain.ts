import { fetchOnce, type FetchOutcome } from "./http-fetch";
import { normalizeUrl } from "./normalize-url";
import { resolveAndValidateHost } from "./ssrf-guard";

export const MAX_REDIRECTS = 5;

export interface ChainHop {
  url: string; // credential-free display form
  status: number;
}

export type ChainOutcome =
  | { kind: "final"; hops: ChainHop[]; finalOutcome: FetchOutcome & { kind: "success" } }
  | { kind: "final-error"; hops: ChainHop[]; finalOutcome: FetchOutcome & { kind: "error" } }
  | { kind: "blocked"; hops: ChainHop[]; blockedUrl: string; reason: string }
  | { kind: "invalid-redirect"; hops: ChainHop[]; rawLocation: string }
  | { kind: "too-many-redirects"; hops: ChainHop[] };

function toDisplayUrl(url: URL): string {
  const copy = new URL(url.href);
  copy.username = "";
  copy.password = "";
  return copy.href;
}

/**
 * Follows redirects starting from an ALREADY-VALIDATED url/ip pair, up to
 * MAX_REDIRECTS hops. Re-validates every subsequent hop through the full
 * SSRF pipeline (normalize -> resolve -> classify) before connecting to it,
 * exactly like the very first request. Never trusts a Location header.
 */
type HostValidator = typeof resolveAndValidateHost;

/**
 * `validateHost` defaults to the real SSRF guard and should never be
 * overridden outside of tests. It exists as a parameter only so tests can
 * simulate "a normal public redirect" without needing a real public server.
 */
export async function followRedirects(
  startUrl: URL,
  startIp: string,
  validateHost: HostValidator = resolveAndValidateHost,
): Promise<ChainOutcome> {
  const hops: ChainHop[] = [];
  let currentUrl = startUrl;
  let currentIp = startIp;

  for (let attempt = 0; attempt <= MAX_REDIRECTS; attempt++) {
    const outcome = await fetchOnce(currentUrl, currentIp);

    if (outcome.kind === "success") {
      hops.push({ url: toDisplayUrl(currentUrl), status: outcome.status });
      return { kind: "final", hops, finalOutcome: outcome };
    }

    if (outcome.kind === "error") {
      hops.push({ url: toDisplayUrl(currentUrl), status: 0 });
      return { kind: "final-error", hops, finalOutcome: outcome };
    }

    // outcome.kind === "redirect" from here on.
    hops.push({ url: toDisplayUrl(currentUrl), status: outcome.status });

    if (attempt === MAX_REDIRECTS) {
      return { kind: "too-many-redirects", hops };
    }

    // Location may be relative (e.g. "/login"); resolve it against the
    // current URL, which is valid per the HTTP spec and very common.
    let nextUrl: URL;
    try {
      nextUrl = new URL(outcome.location, currentUrl);
    } catch {
      return { kind: "invalid-redirect", hops, rawLocation: outcome.location };
    }

    const normalized = normalizeUrl(nextUrl.href);
    if (!normalized.ok) {
      return { kind: "invalid-redirect", hops, rawLocation: outcome.location };
    }

    // THE re-validation step: this hop's host must independently pass the
    // same SSRF check the very first URL passed. No hop is ever trusted
    // just because an earlier hop was safe.
        const safety = await validateHost(normalized.url.hostname);
    if (!safety.safe) {
      return {
        kind: "blocked",
        hops,
        blockedUrl: toDisplayUrl(normalized.url),
        reason: safety.reason,
      };
    }

    currentUrl = normalized.url;
    currentIp = safety.resolvedIps[0];
  }

  // Unreachable, but keeps the return type exhaustive for TypeScript.
  return { kind: "too-many-redirects", hops };
}