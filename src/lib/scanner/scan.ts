import { checkTargetIsSafe } from "./checkers/ssrf-checker";
import { analyzeUrl } from "./checkers/url-checker";
import { normalizeUrl } from "./normalize-url";
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

  // Gate: every future network-based checker (HTTP, TLS, redirects) must be
  // called from inside this `if`. If the target is unsafe, we stop here
  // and never attempt to connect.
  const { finding: ssrfFinding, safeToConnect } = await checkTargetIsSafe(
    normalized.url.hostname,
  );
  findings.push(ssrfFinding);

  if (safeToConnect) {
    // Network-based checkers (HTTP fetch, TLS, headers, redirects) plug in
    // here in later steps, all guarded by the check above.
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