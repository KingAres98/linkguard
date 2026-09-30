import type { Finding } from "../types";
import type { ChainOutcome } from "../redirect-chain";

const MAX_EVIDENCE_LENGTH = 300;
function clip(value: string): string {
  return value.length > MAX_EVIDENCE_LENGTH ? `${value.slice(0, MAX_EVIDENCE_LENGTH)}…` : value;
}

function chainEvidence(hops: { url: string; status: number }[]) {
  return hops.map((hop, i) => ({
    label: `Hop ${i + 1}`,
    value: `${clip(hop.url)} → ${hop.status || "(no response)"}`,
  }));
}

function crossesToHttp(hops: { url: string }[]): boolean {
  for (let i = 0; i < hops.length - 1; i++) {
    if (hops[i].url.startsWith("https://") && hops[i + 1].url.startsWith("http://")) {
      return true;
    }
  }
  return false;
}

export function buildRedirectFindings(outcome: ChainOutcome): Finding[] {
  const findings: Finding[] = [];
  const hopCount = outcome.hops.length;

  if (hopCount > 1) {
    findings.push({
      id: "redirect.chain.followed",
      category: "redirect",
      status: "info",
      severity: "info",
      title: `Request followed ${hopCount - 1} redirect(s)`,
      description: "The URL redirected one or more times before reaching a final response.",
      whyItMatters:
        "Each redirect is a chance for the destination to change. LinkGuard validates every hop independently before connecting to it.",
      recommendation: "",
      evidence: chainEvidence(outcome.hops),
      confidence: "high",
    });

    if (crossesToHttp(outcome.hops)) {
      findings.push({
        id: "redirect.downgrade.https-to-http",
        category: "redirect",
        status: "warning",
        severity: "medium",
        title: "Redirect chain downgrades from HTTPS to HTTP",
        description: "At least one redirect in the chain moves from an https:// URL to an http:// URL.",
        whyItMatters:
          "This removes encryption partway through the chain, which can expose data on that leg of the request.",
        recommendation: "Site owners should keep every redirect hop on HTTPS.",
        evidence: chainEvidence(outcome.hops),
        confidence: "medium",
        limitations: "Some sites intentionally use one HTTP hop for legacy compatibility before returning to HTTPS.",
      });
    }
  } else {
    findings.push({
      id: "redirect.none",
      category: "redirect",
      status: "pass",
      severity: "info",
      title: "No redirects",
      description: "The URL responded directly, with no redirect chain.",
      whyItMatters: "A direct response is simpler to reason about than a multi-hop redirect chain.",
      recommendation: "",
      evidence: [],
      confidence: "high",
    });
  }

  switch (outcome.kind) {
    case "final":
      findings.push({
        id: "http.response.received",
        category: "url",
        status: "pass",
        severity: "info",
        title: "Server responded",
        description: `The final response after any redirects was HTTP status ${outcome.finalOutcome.status}.`,
        whyItMatters: "A successful final response lets later checks (headers, TLS) inspect the real destination.",
        recommendation: "",
        evidence: [
          { label: "Final status code", value: String(outcome.finalOutcome.status) },
          { label: "Final URL", value: clip(outcome.hops[outcome.hops.length - 1].url) },
        ],
        confidence: "high",
      });
      break;

    case "final-error":
      findings.push({
        id: `http.error.${outcome.finalOutcome.reason}`,
        category: "url",
        status: "unknown",
        severity: "info",
        title: "Could not complete the HTTP request",
        description: outcome.finalOutcome.message,
        whyItMatters: "Without a final response, later checks cannot inspect this target.",
        recommendation: "",
        evidence: [{ label: "Reason", value: outcome.finalOutcome.reason }],
        confidence: "medium",
      });
      break;

    case "blocked":
      findings.push({
        id: "redirect.blocked",
        category: "redirect",
        status: "fail",
        severity: "high",
        title: "Redirect points to a disallowed address",
        description: `A redirect in the chain points to ${clip(outcome.blockedUrl)}, which was rejected.`,
        whyItMatters:
          "A public site redirecting to an internal or restricted address is a red flag, and following it would expose LinkGuard's own network to probing.",
        recommendation: "",
        evidence: [
          { label: "Blocked destination", value: clip(outcome.blockedUrl) },
          { label: "Reason", value: outcome.reason },
        ],
        confidence: "high",
        limitations: "LinkGuard stopped before connecting to this address, so nothing about it was actually observed.",
      });
      break;

    case "too-many-redirects":
      findings.push({
        id: "redirect.too-many",
        category: "redirect",
        status: "warning",
        severity: "low",
        title: "Too many redirects",
        description: `The chain exceeded the limit of ${outcome.hops.length - 1} redirects and was stopped.`,
        whyItMatters: "An excessive or looping redirect chain can indicate misconfiguration, or an attempt to exhaust a scanner's resources.",
        recommendation: "",
        evidence: chainEvidence(outcome.hops),
        confidence: "medium",
      });
      break;

    case "invalid-redirect":
      findings.push({
        id: "redirect.invalid-location",
        category: "redirect",
        status: "warning",
        severity: "low",
        title: "Redirect had an invalid destination",
        description: "A redirect response's Location header could not be parsed as a URL.",
        whyItMatters: "A malformed redirect target may indicate a misconfigured server.",
        recommendation: "",
        evidence: [{ label: "Raw Location header", value: clip(outcome.rawLocation) }],
        confidence: "medium",
      });
      break;
  }

  return findings;
}