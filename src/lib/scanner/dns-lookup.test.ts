import { describe, it, expect } from "vitest";
import { getOrganizationalDomain, queryTxtRecords, checkDnssec } from "./dns-lookup";

describe("getOrganizationalDomain", () => {
  it("returns the last two labels for a subdomain", () => {
    expect(getOrganizationalDomain("www.example.com")).toBe("example.com");
    expect(getOrganizationalDomain("mail.blog.example.com")).toBe("example.com");
  });

  it("returns the domain unchanged if it already has two labels", () => {
    expect(getOrganizationalDomain("example.com")).toBe("example.com");
  });

  it("is wrong for multi-part TLDs, as documented", () => {
    // Known limitation: this returns "co.uk" instead of "example.co.uk".
    expect(getOrganizationalDomain("www.example.co.uk")).toBe("co.uk");
  });
});

describe("queryTxtRecords", () => {
  it("finds TXT records for a real domain known to publish SPF", async () => {
    const result = await queryTxtRecords("google.com");
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.some((record) => record.includes("v=spf1"))).toBe(true);
    }
  });

  it("returns not-found for a domain with no TXT records", async () => {
    const result = await queryTxtRecords("this-domain-should-not-exist-linkguard.invalid");
    expect(result.ok).toBe(false);
  });
});

describe("checkDnssec", () => {
  it("detects DNSSEC signing on a domain known to have it (cloudflare.com)", async () => {
    const result = await checkDnssec("cloudflare.com");
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value).toBe(true);
  }, 10000);

  it("succeeds (does not error) on a domain regardless of its DNSSEC status", async () => {
    // We don't assert the value here, since we don't control this domain's
    // config and it could change. We only assert the query itself succeeds
    // (ok: true) rather than failing outright, proving a real NOERROR
    // response is handled distinctly from an actual query failure.
    const result = await checkDnssec("example.com");
    expect(result.ok).toBe(true);
  }, 10000);
});