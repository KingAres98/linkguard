import type { Finding } from "../types";
import { fetchOnce, type FetchOutcome } from "../http-fetch";

const MAX_EVIDENCE_LENGTH = 300;
function clip(value: string): string {
  return value.length > MAX_EVIDENCE_LENGTH ? `${value.slice(0, MAX_EVIDENCE_LENGTH)}…` : value;
}

const ERROR_REASON_TEXT: Record<string, string> = {
  timeout: "The request timed out before the server responded.",
  "too-large": "The response was larger than the size limit and was stopped early.",
  network: "The request could not be completed due to a network error.",
};

export async function checkHttpResponse(
  url: URL,
  pinnedIp: string,
): Promise<{ finding: Finding; outcome: FetchOutcome }> {
  const outcome = await fetchOnce(url, pinnedIp);

  if (outcome.kind === "success") {
    return {
      outcome,
      finding: {
        id: "http.response.received",
        category: "url",
        status: "pass",
        severity: "info",
        title: "Server responded",
        description: `The server returned HTTP status ${outcome.status}.`,
        whyItMatters:
          "A response means the site is reachable, which lets LinkGuard proceed to inspect headers and TLS in later phases.",
        recommendation: "",
        evidence: [{ label: "Status code", value: String(outcome.status) }],
        confidence: "high",
      },
    };
  }

  if (outcome.kind === "redirect") {
    return {
      outcome,
      finding: {
        id: "http.response.redirect",
        category: "redirect",
        status: "info",
        severity: "info",
        title: "Server responded with a redirect",
        description: `The server returned HTTP status ${outcome.status} pointing to a new location.`,
        whyItMatters:
          "Redirects are normal, but the final destination needs its own safety and security checks, which this version does not perform yet.",
        recommendation: "",
        evidence: [
          { label: "Status code", value: String(outcome.status) },
          { label: "Location header", value: clip(outcome.location) },
        ],
        confidence: "high",
        limitations: "This version does not yet follow the redirect to inspect the final destination.",
      },
    };
  }

  return {
    outcome,
    finding: {
      id: `http.error.${outcome.reason}`,
      category: "url",
      status: "unknown",
      severity: "info",
      title: "Could not complete the HTTP request",
      description: ERROR_REASON_TEXT[outcome.reason] ?? outcome.message,
      whyItMatters: "Without a response, LinkGuard cannot check headers or content for this target.",
      recommendation: "",
      evidence: [{ label: "Reason", value: outcome.reason }],
      confidence: "medium",
    },
  };
}