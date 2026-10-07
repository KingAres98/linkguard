import { buildRedirectFindings } from "./checkers/redirect-checker";
import { checkDnsSecurity } from "./checkers/dns-checker";
import { checkTargetIsSafe } from "./checkers/ssrf-checker";
import { checkTls } from "./checkers/tls-checker";
import { checkSecurityHeaders } from "./checkers/header-checker";
import { checkThreatIntel, hostnamesFromUrls } from "./checkers/threat-checker";
import { analyzeUrl } from "./checkers/url-checker";
import { normalizeUrl } from "./normalize-url";
import { followRedirects } from "./redirect-chain";
import { resolveAndValidateHost } from "./ssrf-guard";
import { evaluatePosture } from "./posture";
import { getThreatIndex } from "@/lib/threat";
import type { ThreatIndex } from "@/lib/threat/types";
import type { Finding, ScanReport } from "./types";

export type ScanResult =
  | { ok: true; report: ScanReport }
  | { ok: false; error: string };

/** Lets tests supply their own threat index. App code never passes this. */
export interface ScanDeps {
  threatIndex?: ThreatIndex;
}

function toDisplayTarget(url: URL): string {
  const copy = new URL(url.href);
  copy.username = "";
  copy.password = "";
  return copy.href;
}

export async function runScan(input: string, deps: ScanDeps = {}): Promise<ScanResult> {
  const normalized = normalizeUrl(input);
  if (!normalized.ok) {
    return { ok: false, error: normalized.error };
  }

  const findings: Finding[] = [...analyzeUrl(normalized)];
  const redirectUrls: string[] = [];

  const { finding: ssrfFinding, safeToConnect, resolvedIps } = await checkTargetIsSafe(
    normalized.url.hostname,
  );
  findings.push(ssrfFinding);

  if (safeToConnect && resolvedIps && resolvedIps.length > 0) {
    // DNS/email checks use the ORIGINAL hostname (the domain the user
    // entered), not wherever a redirect eventually lands, since SPF/DMARC
    // describe who may send email for the domain being scanned. They run
    // independently of the HTTP fetch below, so we kick both off together.
    const dnsFindingsPromise = checkDnsSecurity(normalized.url.hostname);

    const chainOutcome = await followRedirects(normalized.url, resolvedIps[0]);
    findings.push(...buildRedirectFindings(chainOutcome));
    redirectUrls.push(...chainOutcome.hops.map((hop) => hop.url));

    if (chainOutcome.kind === "final") {
      const finalUrl = new URL(chainOutcome.hops[chainOutcome.hops.length - 1].url);

      findings.push(
        ...checkSecurityHeaders(chainOutcome.finalOutcome.headers, finalUrl.protocol === "https:"),
      );

      if (finalUrl.protocol === "https:") {
        const finalSafety = await resolveAndValidateHost(finalUrl.hostname);
        if (finalSafety.safe) {
          const port = finalUrl.port ? Number(finalUrl.port) : 443;
          findings.push(...(await checkTls(finalUrl.hostname, finalSafety.resolvedIps[0], port)));
        }
      }
    }

    findings.push(...(await dnsFindingsPromise));
  }

  // Threat feeds are a local lookup (no network), so this runs for every
  // target, including ones we refused to connect to. It covers the entered
  // hostname AND every redirect destination.
  findings.push(
    ...(await checkThreatIntel(
      () => deps.threatIndex ?? getThreatIndex(),
      hostnamesFromUrls(normalized.url.hostname, redirectUrls),
    )),
  );

  const posture = evaluatePosture(findings);

  return {
    ok: true,
    report: {
      target: toDisplayTarget(normalized.url),
      scannedAt: new Date().toISOString(),
      findings,
      posture: {
        label: posture.label,
        drivenByFindingId: posture.drivenBy?.id,
      },
    },
  };
}