import { buildRedirectFindings } from "./checkers/redirect-checker";
import { checkTargetIsSafe } from "./checkers/ssrf-checker";
import { checkTls } from "./checkers/tls-checker";
import { checkSecurityHeaders } from "./checkers/header-checker";
import { analyzeUrl } from "./checkers/url-checker";
import { normalizeUrl } from "./normalize-url";
import { followRedirects } from "./redirect-chain";
import { resolveAndValidateHost } from "./ssrf-guard";
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

  const { finding: ssrfFinding, safeToConnect, resolvedIps } = await checkTargetIsSafe(
    normalized.url.hostname,
  );
  findings.push(ssrfFinding);

  if (safeToConnect && resolvedIps && resolvedIps.length > 0) {
    const chainOutcome = await followRedirects(normalized.url, resolvedIps[0]);
    findings.push(...buildRedirectFindings(chainOutcome));

        // TLS and headers both run against the FINAL destination after any
    // redirects, and only if that final response actually succeeded.
    if (chainOutcome.kind === "final") {
      const finalUrl = new URL(chainOutcome.hops[chainOutcome.hops.length - 1].url);

      findings.push(
        ...checkSecurityHeaders(chainOutcome.finalOutcome.headers, finalUrl.protocol === "https:"),
      );

      if (finalUrl.protocol === "https:") {
        // Re-validate and re-resolve the final host: it may differ from the
        // original if we followed redirects, and TLS must connect to a
        // freshly pinned, already-validated IP just like every other step.
        const finalSafety = await resolveAndValidateHost(finalUrl.hostname);
        if (finalSafety.safe) {
          const port = finalUrl.port ? Number(finalUrl.port) : 443;
          findings.push(...(await checkTls(finalUrl.hostname, finalSafety.resolvedIps[0], port)));
        }
      }
    }

    // DNS and email security checkers plug in here in later steps.
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