import type { Finding } from "../types";
import { inspectCertificate, type TlsInspectResult } from "../tls-inspect";

const EXPIRY_WARNING_DAYS = 30;

const ERROR_REASON_TEXT: Record<string, string> = {
  timeout: "The TLS handshake did not complete in time.",
  "handshake-failed": "The TLS handshake failed, or the server is not serving TLS on this port.",
  "no-certificate": "The server completed a TLS handshake but presented no certificate.",
};

export async function checkTls(
  hostname: string,
  pinnedIp: string,
  port: number,
): Promise<Finding[]> {
  const result: TlsInspectResult = await inspectCertificate(hostname, pinnedIp, port);

  if (!result.ok) {
    return [
      {
        id: `tls.error.${result.reason}`,
        category: "tls",
        status: "unknown",
        severity: "info",
        title: "Could not inspect the TLS certificate",
        description: ERROR_REASON_TEXT[result.reason] ?? "The certificate could not be inspected.",
        whyItMatters: "Without a certificate, LinkGuard cannot report on TLS configuration for this target.",
        recommendation: "",
        evidence: [{ label: "Reason", value: result.reason }],
        confidence: "medium",
      },
    ];
  }

  const cert = result.certificate;
  const findings: Finding[] = [];

  const baseEvidence = [
    { label: "Subject", value: cert.subjectCN ?? "(none)" },
    { label: "Issuer", value: cert.issuerCN ?? "(unknown)" },
    { label: "Issuer organization", value: cert.issuerOrg ?? "(unknown)" },
    { label: "Valid from", value: cert.validFrom },
    { label: "Valid to", value: cert.validTo },
  ];

  // Validity window
  if (cert.isExpired) {
    findings.push({
      id: "tls.certificate.expired",
      category: "tls",
      status: "fail",
      severity: "high",
      title: "TLS certificate has expired",
      description: `The certificate expired ${Math.abs(cert.daysUntilExpiry)} day(s) ago.`,
      whyItMatters:
        "An expired certificate means the connection's identity can no longer be properly verified, and browsers will show warnings to visitors.",
      recommendation: "Renew the TLS certificate.",
      evidence: baseEvidence,
      confidence: "high",
    });
  } else if (cert.isNotYetValid) {
    findings.push({
      id: "tls.certificate.not-yet-valid",
      category: "tls",
      status: "fail",
      severity: "high",
      title: "TLS certificate is not yet valid",
      description: "The certificate's validity period has not started yet.",
      whyItMatters: "This usually indicates a misconfiguration, such as an incorrect server clock or a certificate deployed too early.",
      recommendation: "Check the server's clock and the certificate's intended start date.",
      evidence: baseEvidence,
      confidence: "high",
    });
  } else if (cert.daysUntilExpiry <= EXPIRY_WARNING_DAYS) {
    findings.push({
      id: "tls.certificate.expiring-soon",
      category: "tls",
      status: "warning",
      severity: "medium",
      title: "TLS certificate expires soon",
      description: `The certificate expires in ${cert.daysUntilExpiry} day(s).`,
      whyItMatters: "If the certificate is not renewed before it expires, visitors will see security warnings.",
      recommendation: "Renew the certificate before it expires.",
      evidence: baseEvidence,
      confidence: "high",
    });
  } else {
    findings.push({
      id: "tls.certificate.valid",
      category: "tls",
      status: "pass",
      severity: "info",
      title: "TLS certificate is currently valid",
      description: `The certificate is valid and has ${cert.daysUntilExpiry} day(s) remaining.`,
      whyItMatters: "A valid, current certificate means your browser can verify it is talking to a server holding a certificate for this domain.",
      recommendation: "",
      evidence: baseEvidence,
      confidence: "high",
      limitations:
        "A valid certificate confirms domain control at issuance time. It does not indicate who operates the site, what the site does, or whether it is trustworthy. Attackers can and do obtain valid certificates for malicious domains.",
    });
  }

  // Hostname match, reported as its own finding regardless of validity
  if (cert.hostnameMatches) {
    findings.push({
      id: "tls.hostname.matches",
      category: "tls",
      status: "pass",
      severity: "info",
      title: "Certificate matches the requested hostname",
      description: "The certificate's subject or subject alternative names include this hostname.",
      whyItMatters: "This confirms the certificate was issued for this specific hostname, not a different one.",
      recommendation: "",
      evidence: [{ label: "Subject alternative names", value: cert.subjectAltNames.join(", ") || "(none)" }],
      confidence: "high",
      limitations: "This checks the certificate's binding to the hostname only, not the operator's identity or intent.",
    });
  } else {
    findings.push({
      id: "tls.hostname.mismatch",
      category: "tls",
      status: "fail",
      severity: "high",
      title: "Certificate does not match the requested hostname",
      description: "Neither the certificate's subject nor its alternative names include this hostname.",
      whyItMatters:
        "A mismatched certificate means browsers cannot properly verify this connection's identity, and will show a security warning.",
      recommendation: "Ensure the certificate covers this hostname, or check for a server misconfiguration.",
      evidence: [
        { label: "Certificate subject", value: cert.subjectCN ?? "(none)" },
        { label: "Subject alternative names", value: cert.subjectAltNames.join(", ") || "(none)" },
      ],
      confidence: "high",
    });
  }

  return findings;
}