import type { Finding } from "../types";
import { resolveAndValidateHost, type SafeUrlResult } from "../ssrf-guard";

const REASON_TEXT: Record<string, string> = {
  loopback: "resolves to a loopback address (the server's own machine)",
  private: "resolves to a private network address",
  "link-local": "resolves to a link-local address",
  "cloud-metadata": "resolves to a cloud metadata service address",
  unspecified: "resolves to an unspecified address (0.0.0.0)",
  multicast: "resolves to a multicast address",
  reserved: "resolves to a reserved or unrecognized address",
  "dns-failed": "could not be resolved (DNS lookup failed)",
  "no-addresses": "did not resolve to any address",
};

export interface TargetSafetyResult {
  finding: Finding;
  safeToConnect: boolean;
  resolvedIps?: string[];
}

export async function checkTargetIsSafe(hostname: string): Promise<TargetSafetyResult> {
  const result: SafeUrlResult = await resolveAndValidateHost(hostname);

  if (result.safe) {
    return {
      safeToConnect: true,
      resolvedIps: result.resolvedIps,
      finding: {
        id: "ssrf.target.allowed",
        category: "url",
        status: "info",
        severity: "info",
        title: "Target address is eligible to be scanned",
        description: `The hostname resolved to a public address: ${result.resolvedIps.join(", ")}.`,
        whyItMatters:
          "LinkGuard only connects to public internet addresses, to avoid being used to probe internal networks.",
        recommendation: "",
        evidence: result.resolvedIps.map((ip, i) => ({
          label: `Resolved address ${i + 1}`,
          value: ip,
        })),
        confidence: "high",
      },
    };
  }

  return {
    safeToConnect: false,
    finding: {
      id: "ssrf.target.blocked",
      category: "url",
      status: "fail",
      severity: "high",
      title: "This address cannot be scanned",
      description: `The target ${REASON_TEXT[result.reason] ?? "could not be safely resolved"}.`,
      whyItMatters:
        "LinkGuard will not connect to internal, private, or unresolvable addresses. This protects both LinkGuard's infrastructure and any network it runs on.",
      recommendation: "",
      evidence: [{ label: "Reason", value: result.reason }],
      confidence: "high",
      limitations: "This is a safety restriction, not a security finding about the destination itself.",
    },
  };
}