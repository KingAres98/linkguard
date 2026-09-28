import { describe, it, expect } from "vitest";
import { normalizeUrl } from "../normalize-url";
import { analyzeUrl } from "./url-checker";
import type { Finding } from "../types";

function analyze(input: string): Finding[] {
  const result = normalizeUrl(input);
  if (!result.ok) throw new Error(`test setup: invalid URL: ${result.error}`);
  return analyzeUrl(result);
}

function ids(findings: Finding[]): string[] {
  return findings.map((f) => f.id);
}

describe("analyzeUrl", () => {
  it("reports HTTPS and no indicators for an ordinary https URL", () => {
    const found = ids(analyze("https://example.com"));
    expect(found).toContain("url.syntax.valid");
    expect(found).toContain("url.https.enabled");
    expect(found).toContain("url.indicators.none");
  });

  it("warns about plain http", () => {
    const finding = analyze("http://example.com").find((f) => f.id === "url.https.missing");
    expect(finding?.status).toBe("warning");
    expect(finding?.severity).toBe("low");
  });

  it("does not claim to have observed https when the scheme was assumed", () => {
    const found = ids(analyze("example.com"));
    expect(found).toContain("url.scheme.assumed");
    expect(found).not.toContain("url.https.enabled");
  });

  it.each([
    ["IPv4", "http://192.168.1.1"],
    ["obfuscated IPv4", "http://2130706433"],
    ["IPv6", "http://[::1]/"],
  ])("flags an %s host", (_name, input) => {
    const found = ids(analyze(input));
    expect(found).toContain("url.host.ip-address");
    expect(found).not.toContain("url.indicators.none");
  });

  it("flags embedded credentials and shows the real host", () => {
    const finding = analyze("https://paypal.com@evil.test").find(
      (f) => f.id === "url.userinfo.present",
    );
    expect(finding).toBeDefined();
    expect(finding?.evidence).toContainEqual({
      label: "Actual destination host",
      value: "evil.test",
    });
  });

  it("never includes a password in any finding", () => {
    const findings = analyze("https://user:s3cret@example.com");
    expect(JSON.stringify(findings)).not.toContain("s3cret");
  });

  it("flags punycode hostnames", () => {
    expect(ids(analyze("https://xn--mnchen-3ya.de"))).toContain("url.host.punycode");
  });

  it("flags many subdomain levels but not a normal www host", () => {
    expect(ids(analyze("https://a.b.c.d.example.com"))).toContain("url.host.many-subdomains");
    expect(ids(analyze("https://www.example.com"))).not.toContain("url.host.many-subdomains");
  });

  it("flags non-default ports but not the default one", () => {
    expect(ids(analyze("https://example.com:8443"))).toContain("url.port.non-default");
    expect(ids(analyze("https://example.com:443"))).not.toContain("url.port.non-default");
  });

  it("flags double encoding but not single encoding", () => {
    expect(ids(analyze("https://example.com/a%252Fb"))).toContain("url.encoding.double");
    expect(ids(analyze("https://example.com/a%2Fb"))).not.toContain("url.encoding.double");
  });

  it("explains the limitations of every passing finding", () => {
    const passes = analyze("https://example.com").filter((f) => f.status === "pass");
    expect(passes.length).toBeGreaterThan(0);
    for (const finding of passes) {
      expect(finding.limitations, finding.id).toBeTruthy();
    }
  });
});