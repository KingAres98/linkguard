import type { Finding } from "../types";

const MAX_EVIDENCE_LENGTH = 300;
function clip(value: string): string {
  return value.length > MAX_EVIDENCE_LENGTH ? `${value.slice(0, MAX_EVIDENCE_LENGTH)}…` : value;
}

/** Node lowercases all header names, so we always read them lowercase. */
function checkHsts(headers: Record<string, string>, isHttps: boolean): Finding {
  const value = headers["strict-transport-security"];

  if (!isHttps) {
    return {
      id: "headers.hsts.not-applicable",
      category: "headers",
      status: "info",
      severity: "info",
      title: "HSTS not applicable over plain HTTP",
      description: "The final response was served over HTTP, not HTTPS, so HSTS does not apply.",
      whyItMatters: "HSTS is a header servers send over HTTPS to tell browsers to always use HTTPS in future. It has no effect over a plain HTTP connection.",
      recommendation: "",
      evidence: [],
      confidence: "high",
    };
  }

  if (!value) {
    return {
      id: "headers.hsts.missing",
      category: "headers",
      status: "warning",
      severity: "low",
      title: "HSTS not detected",
      description: "The response did not include a Strict-Transport-Security header.",
      whyItMatters:
        "Without HSTS, a visitor's very first connection (or one after clearing browser data) is not automatically upgraded to HTTPS, leaving a brief window for an HTTPS-downgrade attack.",
      recommendation: "Add a Strict-Transport-Security header, for example: max-age=31536000; includeSubDomains.",
      evidence: [{ label: "Strict-Transport-Security", value: "(absent)" }],
      confidence: "high",
    };
  }

  const maxAgeMatch = value.match(/max-age=(\d+)/i);
  const maxAge = maxAgeMatch ? Number(maxAgeMatch[1]) : 0;
  const oneWeekSeconds = 7 * 24 * 60 * 60;

  if (maxAge < oneWeekSeconds) {
    return {
      id: "headers.hsts.short-max-age",
      category: "headers",
      status: "warning",
      severity: "low",
      title: "HSTS max-age is very short",
      description: `The Strict-Transport-Security header sets max-age to ${maxAge} seconds, under one week.`,
      whyItMatters: "A short max-age means the HTTPS-only instruction expires quickly, reducing how long HSTS protects returning visitors.",
      recommendation: "Consider a longer max-age, such as 31536000 (one year), once the HTTPS configuration is stable.",
      evidence: [{ label: "Strict-Transport-Security", value: clip(value) }],
      confidence: "high",
    };
  }

  return {
    id: "headers.hsts.present",
    category: "headers",
    status: "pass",
    severity: "info",
    title: "HSTS is configured",
    description: "The response includes a Strict-Transport-Security header with a reasonable max-age.",
    whyItMatters: "This tells browsers to only ever connect to this site over HTTPS, reducing exposure to downgrade attacks.",
    recommendation: "",
    evidence: [{ label: "Strict-Transport-Security", value: clip(value) }],
    confidence: "high",
  };
}

function checkCsp(headers: Record<string, string>): Finding {
  const value = headers["content-security-policy"];

  if (!value) {
    return {
      id: "headers.csp.missing",
      category: "headers",
      status: "warning",
      severity: "low",
      title: "Content Security Policy not detected",
      description: "The response did not include a Content-Security-Policy header.",
      whyItMatters:
        "A CSP restricts which scripts, styles, and other resources a page may load, which can reduce the impact of a cross-site scripting bug if one exists.",
      recommendation: "Define a Content-Security-Policy suited to the site, starting in report-only mode to avoid breaking existing functionality.",
      evidence: [{ label: "Content-Security-Policy", value: "(absent)" }],
      confidence: "high",
      limitations: "Most sites on the web today do not set a CSP. Its absence alone is common and not a strong signal by itself.",
    };
  }

  const allowsUnsafeInline = /script-src[^;]*'unsafe-inline'/i.test(value);
  const allowsWildcard = /script-src[^;]*\*(?!\S)/i.test(value) || /default-src[^;]*\*(?!\S)/i.test(value);

  if (allowsUnsafeInline || allowsWildcard) {
    return {
      id: "headers.csp.weak",
      category: "headers",
      status: "warning",
      severity: "low",
      title: "Content Security Policy allows broad script sources",
      description: allowsUnsafeInline
        ? "The policy's script-src includes 'unsafe-inline', which allows inline scripts."
        : "The policy allows scripts from any source ('*').",
      whyItMatters: "A CSP this permissive provides much weaker protection against script injection than a more restrictive policy.",
      recommendation: "Avoid 'unsafe-inline' and wildcard sources in script-src where practical.",
      evidence: [{ label: "Content-Security-Policy", value: clip(value) }],
      confidence: "medium",
    };
  }

  return {
    id: "headers.csp.present",
    category: "headers",
    status: "pass",
    severity: "info",
    title: "Content Security Policy is configured",
    description: "The response includes a Content-Security-Policy header.",
    whyItMatters: "A CSP helps limit the resources a page can load, reducing the impact of certain injection attacks.",
    recommendation: "",
    evidence: [{ label: "Content-Security-Policy", value: clip(value) }],
    confidence: "medium",
    limitations: "This checks only for the header's presence and a couple of common weaknesses, not the full correctness of the policy.",
  };
}

function checkXContentTypeOptions(headers: Record<string, string>): Finding {
  const value = headers["x-content-type-options"];

  if (value?.toLowerCase() === "nosniff") {
    return {
      id: "headers.xcto.present",
      category: "headers",
      status: "pass",
      severity: "info",
      title: "X-Content-Type-Options is set correctly",
      description: "The response includes X-Content-Type-Options: nosniff.",
      whyItMatters: "This stops browsers from guessing a file's type in a way that could cause a non-script file to be executed as a script.",
      recommendation: "",
      evidence: [{ label: "X-Content-Type-Options", value }],
      confidence: "high",
    };
  }

  return {
    id: "headers.xcto.missing",
    category: "headers",
    status: "warning",
    severity: "low",
    title: "X-Content-Type-Options not detected",
    description: "The response did not include X-Content-Type-Options: nosniff.",
    whyItMatters: "Without this header, some browsers may try to guess a resource's type, which has historically enabled certain content-sniffing attacks.",
    recommendation: "Add the header X-Content-Type-Options: nosniff.",
    evidence: [{ label: "X-Content-Type-Options", value: value ? clip(value) : "(absent)" }],
    confidence: "high",
  };
}

function checkXFrameOptions(headers: Record<string, string>): Finding {
  const xfo = headers["x-frame-options"];
  const csp = headers["content-security-policy"];
  const cspHasFrameAncestors = csp ? /frame-ancestors/i.test(csp) : false;

  if (xfo || cspHasFrameAncestors) {
    return {
      id: "headers.frame-protection.present",
      category: "headers",
      status: "pass",
      severity: "info",
      title: "Clickjacking protection is configured",
      description: xfo
        ? `The response includes X-Frame-Options: ${xfo}.`
        : "The Content-Security-Policy includes a frame-ancestors directive.",
      whyItMatters: "This controls whether the page can be embedded in a frame on another site, which helps prevent clickjacking.",
      recommendation: "",
      evidence: [{ label: xfo ? "X-Frame-Options" : "CSP frame-ancestors", value: clip(xfo ?? csp ?? "") }],
      confidence: "high",
    };
  }

  return {
    id: "headers.frame-protection.missing",
    category: "headers",
    status: "warning",
    severity: "low",
    title: "No clickjacking protection detected",
    description: "The response has neither an X-Frame-Options header nor a CSP frame-ancestors directive.",
    whyItMatters: "Without one of these, the page could potentially be embedded in a frame on another site as part of a clickjacking attack.",
    recommendation: "Add X-Frame-Options: DENY (or SAMEORIGIN), or a CSP frame-ancestors directive.",
    evidence: [{ label: "X-Frame-Options", value: "(absent)" }],
    confidence: "high",
  };
}

function checkReferrerPolicy(headers: Record<string, string>): Finding {
  const value = headers["referrer-policy"];

  if (!value) {
    return {
      id: "headers.referrer-policy.missing",
      category: "headers",
      status: "info",
      severity: "info",
      title: "Referrer-Policy not detected",
      description: "The response did not include a Referrer-Policy header.",
      whyItMatters: "Without this header, browsers fall back to a default that may send more of the originating URL to other sites than necessary.",
      recommendation: "Add a Referrer-Policy header, such as strict-origin-when-cross-origin.",
      evidence: [{ label: "Referrer-Policy", value: "(absent)" }],
      confidence: "high",
      limitations: "Modern browsers already default to a reasonably safe policy, so the practical impact of an absent header is often small.",
    };
  }

  return {
    id: "headers.referrer-policy.present",
    category: "headers",
    status: "pass",
    severity: "info",
    title: "Referrer-Policy is configured",
    description: "The response includes a Referrer-Policy header.",
    whyItMatters: "This controls how much information about the current page is sent to other sites when a visitor follows a link.",
    recommendation: "",
    evidence: [{ label: "Referrer-Policy", value: clip(value) }],
    confidence: "high",
  };
}

function checkPermissionsPolicy(headers: Record<string, string>): Finding {
  const value = headers["permissions-policy"];

  if (!value) {
    return {
      id: "headers.permissions-policy.missing",
      category: "headers",
      status: "info",
      severity: "info",
      title: "Permissions-Policy not detected",
      description: "The response did not include a Permissions-Policy header.",
      whyItMatters: "This header can restrict access to browser features like camera, microphone, and geolocation. Its absence means no extra restriction is applied beyond browser defaults.",
      recommendation: "Consider adding a Permissions-Policy header if the site does not need access to sensitive browser features.",
      evidence: [{ label: "Permissions-Policy", value: "(absent)" }],
      confidence: "medium",
      limitations: "Many sites have no need to restrict these features and do not set this header. Its absence is common and not a strong signal alone.",
    };
  }

  return {
    id: "headers.permissions-policy.present",
    category: "headers",
    status: "pass",
    severity: "info",
    title: "Permissions-Policy is configured",
    description: "The response includes a Permissions-Policy header.",
    whyItMatters: "This restricts which browser features (such as camera or geolocation) the page and any embedded content can access.",
    recommendation: "",
    evidence: [{ label: "Permissions-Policy", value: clip(value) }],
    confidence: "medium",
  };
}

/** Evaluates security-relevant headers from the final response. Pure function: no network I/O. */
export function checkSecurityHeaders(headers: Record<string, string>, isHttps: boolean): Finding[] {
  return [
    checkHsts(headers, isHttps),
    checkCsp(headers),
    checkXContentTypeOptions(headers),
    checkXFrameOptions(headers),
    checkReferrerPolicy(headers),
    checkPermissionsPolicy(headers),
  ];
}