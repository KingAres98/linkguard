import type { Finding } from "../types";
import { getOrganizationalDomain, queryTxtRecords, checkDnssec } from "../dns-lookup";

const MAX_EVIDENCE_LENGTH = 300;
function clip(value: string): string {
  return value.length > MAX_EVIDENCE_LENGTH ? `${value.slice(0, MAX_EVIDENCE_LENGTH)}…` : value;
}

const QUERY_ERROR_TEXT: Record<string, string> = {
  timeout: "The DNS query did not complete in time.",
  "not-found": "No record was found.",
  "query-failed": "The DNS query could not be completed.",
};

async function checkSpf(domain: string): Promise<Finding> {
  const result = await queryTxtRecords(domain);

  if (!result.ok) {
    const status = result.reason === "not-found" ? "fail" : "unknown";
    return {
      id: result.reason === "not-found" ? "email.spf.missing" : `email.spf.error.${result.reason}`,
      category: "email",
      status,
      severity: status === "fail" ? "medium" : "info",
      title: status === "fail" ? "No SPF record found" : "Could not check SPF",
      description:
        status === "fail"
          ? `No TXT records were found at ${domain}.`
          : QUERY_ERROR_TEXT[result.reason],
      whyItMatters:
        "SPF lists which mail servers are allowed to send email claiming to be from this domain. Without it, receiving mail servers have less basis to reject spoofed email.",
      recommendation: status === "fail" ? "Publish an SPF TXT record, such as: v=spf1 include:_spf.example.com ~all" : "",
      evidence: [{ label: "Domain queried", value: domain }],
      confidence: status === "fail" ? "medium" : "low",
      limitations:
        "This concerns email spoofing protection only. It says nothing about whether the website itself is safe.",
    };
  }

  const spfRecords = result.value.filter((record) => record.toLowerCase().startsWith("v=spf1"));

  if (spfRecords.length === 0) {
    return {
      id: "email.spf.missing",
      category: "email",
      status: "fail",
      severity: "medium",
      title: "No SPF record found",
      description: `TXT records exist at ${domain}, but none begin with v=spf1.`,
      whyItMatters:
        "SPF lists which mail servers are allowed to send email claiming to be from this domain. Without it, receiving mail servers have less basis to reject spoofed email.",
      recommendation: "Publish an SPF TXT record, such as: v=spf1 include:_spf.example.com ~all",
      evidence: [{ label: "Domain queried", value: domain }],
      confidence: "high",
      limitations: "This concerns email spoofing protection only. It says nothing about whether the website itself is safe.",
    };
  }

  if (spfRecords.length > 1) {
    return {
      id: "email.spf.multiple",
      category: "email",
      status: "warning",
      severity: "low",
      title: "Multiple SPF records found",
      description: `${spfRecords.length} separate v=spf1 TXT records were found, but the standard permits only one.`,
      whyItMatters:
        "Multiple SPF records is explicitly invalid per the SPF standard, and can cause mail servers to fail SPF checks unpredictably.",
      recommendation: "Combine all SPF rules into a single v=spf1 TXT record.",
            evidence: [
        { label: "Domain queried", value: domain },
        ...spfRecords.map((record, i) => ({ label: `Record ${i + 1}`, value: clip(record) })),
      ],
      confidence: "high",
      limitations: "This concerns email spoofing protection only. It says nothing about whether the website itself is safe.",
    };
  }

  const record = spfRecords[0];
  const hasHardOrSoftFail = /[-~]all\s*$/.test(record.trim());

  return {
    id: "email.spf.present",
    category: "email",
    status: hasHardOrSoftFail ? "pass" : "warning",
    severity: hasHardOrSoftFail ? "info" : "low",
    title: hasHardOrSoftFail ? "SPF record found" : "SPF record found, but does not end restrictively",
    description: hasHardOrSoftFail
      ? "A single, valid SPF record was found ending in a fail mechanism."
      : "An SPF record was found, but it does not end in ~all or -all, which weakens its effect.",
    whyItMatters:
      "SPF lists which mail servers are allowed to send email claiming to be from this domain, helping receivers reject spoofed messages.",
    recommendation: hasHardOrSoftFail ? "" : "End the SPF record with ~all (soft fail) or -all (hard fail) rather than a permissive qualifier.",
        evidence: [
      { label: "Domain queried", value: domain },
      { label: "SPF record", value: clip(record) },
    ],
    confidence: "high",
    limitations: "This concerns email spoofing protection only. It says nothing about whether the website itself is safe.",
  };
}

async function checkDmarc(domain: string): Promise<Finding> {
  const dmarcDomain = `_dmarc.${domain}`;
  const result = await queryTxtRecords(dmarcDomain);

  if (!result.ok) {
    const status = result.reason === "not-found" ? "fail" : "unknown";
    return {
      id: result.reason === "not-found" ? "email.dmarc.missing" : `email.dmarc.error.${result.reason}`,
      category: "email",
      status,
      severity: status === "fail" ? "medium" : "info",
      title: status === "fail" ? "No DMARC policy found" : "Could not check DMARC",
      description:
        status === "fail"
          ? `No DMARC TXT record was found at ${dmarcDomain}.`
          : QUERY_ERROR_TEXT[result.reason],
      whyItMatters:
        "DMARC tells receiving mail servers what to do with email that fails SPF/DKIM checks, and builds on those to reduce domain spoofing.",
      recommendation: status === "fail" ? "Publish a DMARC TXT record, starting with: v=DMARC1; p=none; to monitor before enforcing." : "",
      evidence: [{ label: "Domain queried", value: dmarcDomain }],
      confidence: status === "fail" ? "medium" : "low",
      limitations: "This concerns email spoofing protection only. It says nothing about whether the website itself is safe.",
    };
  }

  const dmarcRecords = result.value.filter((record) => record.toLowerCase().startsWith("v=dmarc1"));

  if (dmarcRecords.length === 0) {
    return {
      id: "email.dmarc.missing",
      category: "email",
      status: "fail",
      severity: "medium",
      title: "No DMARC policy found",
      description: `TXT records exist at ${dmarcDomain}, but none begin with v=DMARC1.`,
      whyItMatters: "DMARC tells receiving mail servers what to do with email that fails authentication checks.",
      recommendation: "Publish a DMARC TXT record, starting with: v=DMARC1; p=none; to monitor before enforcing.",
      evidence: [{ label: "Domain queried", value: dmarcDomain }],
      confidence: "high",
      limitations: "This concerns email spoofing protection only. It says nothing about whether the website itself is safe.",
    };
  }

  const record = dmarcRecords[0];
  const policyMatch = record.match(/p=(\w+)/i);
  const policy = policyMatch ? policyMatch[1].toLowerCase() : null;

  if (policy === "none" || !policy) {
    return {
      id: "email.dmarc.monitor-only",
      category: "email",
      status: "warning",
      severity: "low",
      title: "DMARC policy is monitor-only",
      description: `The DMARC record sets p=${policy ?? "(missing)"}, which takes no action on failing mail.`,
      whyItMatters: "A p=none policy collects reports but does not instruct receivers to quarantine or reject spoofed mail.",
      recommendation: "Once monitoring confirms legitimate mail passes, move to p=quarantine or p=reject.",
            evidence: [
        { label: "Domain queried", value: dmarcDomain },
        { label: "DMARC record", value: clip(record) },
      ],
      confidence: "high",
      limitations: "This concerns email spoofing protection only. It says nothing about whether the website itself is safe.",
    };
  }

  return {
    id: "email.dmarc.enforced",
    category: "email",
    status: "pass",
    severity: "info",
    title: "DMARC policy is enforced",
    description: `The DMARC record sets p=${policy}, which acts on mail that fails authentication.`,
    whyItMatters: "This gives receiving mail servers clear instructions for handling spoofed email from this domain.",
    recommendation: "",
        evidence: [
      { label: "Domain queried", value: dmarcDomain },
      { label: "DMARC record", value: clip(record) },
    ],
    confidence: "high",
    limitations: "This concerns email spoofing protection only. It says nothing about whether the website itself is safe.",
  };
}

async function checkDnssecFinding(domain: string): Promise<Finding> {
  const result = await checkDnssec(domain);

  if (!result.ok) {
    return {
      id: `dns.dnssec.error.${result.reason}`,
      category: "dns",
      status: "unknown",
      severity: "info",
      title: "Could not check DNSSEC",
      description: QUERY_ERROR_TEXT[result.reason],
      whyItMatters: "DNSSEC helps confirm DNS answers for this domain were not tampered with in transit. We could not determine its status.",
      recommendation: "",
      evidence: [{ label: "Domain queried", value: domain }],
      confidence: "low",
      limitations: "An incomplete check is reported as unknown, never as a pass or a fail.",
    };
  }

  if (result.value) {
    return {
      id: "dns.dnssec.enabled",
      category: "dns",
      status: "pass",
      severity: "info",
      title: "DNSSEC appears to be enabled",
      description: "A public DNSSEC-validating resolver reported this domain's DNS answers as authenticated.",
      whyItMatters: "DNSSEC helps confirm that DNS answers for this domain were not tampered with in transit.",
      recommendation: "",
      evidence: [{ label: "Domain queried", value: domain }, { label: "Validated by", value: "Cloudflare DNS-over-HTTPS resolver" }],
      confidence: "medium",
      limitations:
        "This relies on a third-party resolver's own DNSSEC validation rather than an independent cryptographic check performed by LinkGuard itself. It also says nothing about the website's content or intent.",
    };
  }

  return {
    id: "dns.dnssec.not-detected",
    category: "dns",
    status: "info",
    severity: "info",
    title: "DNSSEC not detected",
    description: "A public DNSSEC-validating resolver did not report this domain's DNS answers as authenticated.",
    whyItMatters: "Without DNSSEC, DNS answers for this domain rely only on transport-level protections, not cryptographic signing.",
    recommendation: "Domain owners can enable DNSSEC through their DNS provider or registrar.",
    evidence: [{ label: "Domain queried", value: domain }],
    confidence: "medium",
    limitations: "The large majority of domains on the internet do not use DNSSEC today, so its absence alone is common and not a strong signal.",
  };
}

/** Runs SPF, DMARC, and DNSSEC checks for a hostname's organizational domain. */
export async function checkDnsSecurity(hostname: string): Promise<Finding[]> {
  const domain = getOrganizationalDomain(hostname);
  const [spf, dmarc, dnssec] = await Promise.all([
    checkSpf(domain),
    checkDmarc(domain),
    checkDnssecFinding(domain),
  ]);
  return [spf, dmarc, dnssec];
}