import { buildRedirectFindings } from "./checkers/redirect-checker";
import { checkTargetIsSafe } from "./checkers/ssrf-checker";
import { analyzeUrl } from "./checkers/url-checker";
import { normalizeUrl } from "./normalize-url";
import { followRedirects } from "./redirect-chain";
import type { Finding, ScanReport } from "./types";

export type ScanResult =
  | { ok: true; report: ScanReport }
  | { ok: false; error: string };

function toDisplayTarget(url: URL): string {
  const copy = new URL(url.href);
  copy.username = "";
  copy.password = "";
  return copy.href;
}

export async function runScan(input: string): Promise<ScanResult> {
  const normalized = normalizeUrl(input);
  if (!normalized.ok) {
    return { ok: false, error: normalized.error };
  }

  const findings: Finding[] = [...analyzeUrl(normalized)];

  // Gate: every network-based checker (HTTP fetch, redirects, TLS, headers)
  // is called from inside this `if`, using the pinned IP already validated.
  const { finding: ssrfFinding, safeToConnect, resolvedIps } = await checkTargetIsSafe(
    normalized.url.hostname,
  );
  findings.push(ssrfFinding);

  if (safeToConnect && resolvedIps && resolvedIps.length > 0) {
    const chainOutcome = await followRedirects(normalized.url, resolvedIps[0]);
    findings.push(...buildRedirectFindings(chainOutcome));

    // TLS and security header checkers plug in here in later steps, once
    // we have a final, validated destination to inspect.
  }

  return {
    ok: true,
    report: {
      target: toDisplayTarget(normalized.url),
      scannedAt: new Date().toISOString(),
      findings,
    },
  };
}