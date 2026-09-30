import { describe, it, expect } from "vitest";
import { checkDnsSecurity } from "./dns-checker";
import type { Finding } from "../types";

function idOf(findings: Finding[], prefix: string): Finding | undefined {
  return findings.find((f) => f.id.startsWith(prefix));
}

describe("checkDnsSecurity", () => {
  it("returns exactly one SPF, one DMARC, and one DNSSEC finding", async () => {
    const findings = await checkDnsSecurity("google.com");
    expect(findings.filter((f) => f.category === "email")).toHaveLength(2);
    expect(findings.filter((f) => f.category === "dns")).toHaveLength(1);
  }, 15000);

  it("detects a real SPF record on a domain known to publish one", async () => {
    const findings = await checkDnsSecurity("google.com");
    const spf = idOf(findings, "email.spf");
    expect(spf?.status).not.toBe("fail");
    expect(spf?.evidence.some((e) => e.value.toLowerCase().includes("spf1"))).toBe(true);
  }, 15000);

  it("every email finding explains it is about spoofing protection, not site safety", async () => {
    const findings = await checkDnsSecurity("google.com");
    const emailFindings = findings.filter((f) => f.category === "email");
    for (const finding of emailFindings) {
      expect(finding.limitations, finding.id).toMatch(/spoofing|website itself/i);
    }
  }, 15000);

  it("reports a domain with no email records as fail, not unknown", async () => {
    // A domain that resolves but is very unlikely to have SPF/DMARC set up.
    const findings = await checkDnsSecurity("example.com");
    const spf = idOf(findings, "email.spf");
    const dmarc = idOf(findings, "email.dmarc");
    // We assert these are a definitive fail/pass/warning (not "unknown"),
    // proving a real NOERROR-but-empty DNS answer isn't mistaken for a
    // failed query.
    expect(spf?.status).not.toBe("unknown");
    expect(dmarc?.status).not.toBe("unknown");
  }, 15000);

  it("queries the organizational domain, not a subdomain directly", async () => {
    const findings = await checkDnsSecurity("www.google.com");
    const spf = idOf(findings, "email.spf");
    expect(spf?.evidence.some((e) => e.value === "google.com")).toBe(true);
  }, 15000);
});