import type { ScanReport } from "./types";

/** TEMPORARY: fake data for building the UI. Deleted once real checkers exist. */
export function createSampleReport(target: string): ScanReport {
  return {
    target,
    scannedAt: new Date().toISOString(),
    findings: [
      {
        id: "url.https.enabled",
        category: "url",
        status: "pass",
        severity: "info",
        title: "HTTPS in use",
        description: "The URL uses the https:// scheme.",
        whyItMatters:
          "HTTPS encrypts traffic between your browser and the server, so others on the network can't easily read or alter it.",
        recommendation: "",
        evidence: [{ label: "Scheme", value: "https" }],
        confidence: "high",
        limitations:
          "HTTPS protects the connection. It says nothing about who runs the site or whether the site is trustworthy.",
      },
      {
        id: "tls.certificate.valid",
        category: "tls",
        status: "pass",
        severity: "info",
        title: "TLS certificate is valid",
        description: "The certificate matches the hostname and has not expired.",
        whyItMatters:
          "A valid certificate means your browser can verify it is talking to the server that holds a certificate for this domain.",
        recommendation: "",
        evidence: [
          { label: "Issuer", value: "Example CA" },
          { label: "Expires", value: "2027-01-15" },
        ],
        confidence: "high",
        limitations:
          "Attackers can and do obtain valid certificates for malicious sites. A valid certificate is not a safety verdict.",
      },
      {
        id: "headers.hsts.missing",
        category: "headers",
        status: "warning",
        severity: "low",
        title: "HSTS not detected",
        description: "The response did not include a Strict-Transport-Security header.",
        whyItMatters:
          "Without HSTS, browsers may be more exposed to HTTPS downgrade attacks on a first visit.",
        recommendation:
          "Add a Strict-Transport-Security header, for example: max-age=31536000; includeSubDomains.",
        evidence: [{ label: "Strict-Transport-Security", value: "(absent)" }],
        confidence: "high",
      },
      {
        id: "headers.csp.missing",
        category: "headers",
        status: "warning",
        severity: "low",
        title: "Content Security Policy not detected",
        description: "The response did not include a Content-Security-Policy header.",
        whyItMatters:
          "A CSP limits which scripts and resources a page may load, reducing the impact of cross-site scripting bugs.",
        recommendation: "Define a Content-Security-Policy suited to the site, starting in report-only mode.",
        evidence: [{ label: "Content-Security-Policy", value: "(absent)" }],
        confidence: "high",
        limitations: "Many legitimate sites lack a CSP. Its absence does not mean the site is vulnerable.",
      },
      {
        id: "email.dmarc.missing",
        category: "email",
        status: "fail",
        severity: "medium",
        title: "No DMARC policy found",
        description: "No DMARC record was found at _dmarc for this domain.",
        whyItMatters:
          "Without DMARC, receivers have less guidance on rejecting email that spoofs this domain.",
        recommendation: "Publish a DMARC TXT record, starting with p=none to monitor before enforcing.",
        evidence: [{ label: "TXT _dmarc lookup", value: "(no record)" }],
        confidence: "medium",
        limitations:
          "This concerns email spoofing protection only. It does not indicate whether the website itself is safe.",
      },
      {
        id: "dns.dnssec.unknown",
        category: "dns",
        status: "unknown",
        severity: "info",
        title: "DNSSEC could not be checked",
        description: "The DNSSEC lookup did not complete.",
        whyItMatters:
          "DNSSEC helps confirm DNS answers were not tampered with. We could not determine its state.",
        recommendation: "",
        evidence: [{ label: "Result", value: "Lookup timed out" }],
        confidence: "low",
        limitations: "An incomplete check is reported as unknown, never as a pass or a fail.",
      },
    ],
  };
}