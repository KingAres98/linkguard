import { describe, expect, it } from "vitest";
import { MAX_LIST_BYTES, parseDomainList } from "./domain-list";

function domainsOf(text: string): string[] {
  const result = parseDomainList(text);
  if (!result.ok) throw new Error(result.error);
  return result.domains;
}

describe("parseDomainList: text formats", () => {
  it("reads one domain per line", () => {
    expect(domainsOf("example.com\nexample.org\n")).toEqual(["example.com", "example.org"]);
  });

  it("ignores blank lines and comments", () => {
    const text = "# my list\n\n! another comment\n// third\nexample.com\n";
    const result = parseDomainList(text);
    expect(result).toMatchObject({ ok: true, domains: ["example.com"], skipped: 0 });
  });

  it("reduces URLs to hostnames", () => {
    expect(domainsOf("https://Example.com:8080/path?x=1\nhttp://sub.example.org/a")).toEqual([
      "example.com",
      "sub.example.org",
    ]);
  });

  it("reads hosts-file lines and skips the IP column", () => {
    const text = "127.0.0.1 localhost\n0.0.0.0 ads.example.com\n0.0.0.0 tracker.example.net # note\n";
    const result = parseDomainList(text);
    expect(result).toMatchObject({
      ok: true,
      domains: ["ads.example.com", "tracker.example.net"],
      skipped: 1,
    });
  });

  it("reads ad-blocker style entries", () => {
    expect(domainsOf("||ads.example.com^\n||cdn.example.org^$third-party")).toEqual([
      "ads.example.com",
      "cdn.example.org",
    ]);
  });

  it("removes wildcard prefixes", () => {
    expect(domainsOf("*.example.com")).toEqual(["example.com"]);
  });

  it("reads separators within one line", () => {
    expect(domainsOf("a.com, b.org; c.net d.io")).toEqual(["a.com", "b.org", "c.net", "d.io"]);
  });

  it("removes duplicates and normalizes case", () => {
    expect(domainsOf("example.com\nEXAMPLE.com\nhttps://example.com/x")).toEqual(["example.com"]);
  });

  it("handles a byte order mark", () => {
    expect(domainsOf("\uFEFFexample.com")).toEqual(["example.com"]);
  });

  it("skips junk and counts it", () => {
    const result = parseDomainList("example.com\ne.g\nhello\n");
    expect(result).toMatchObject({ ok: true, domains: ["example.com"], skipped: 2 });
  });

  it("never imports IP addresses", () => {
    const result = parseDomainList("8.8.8.8\n192.168.1.1\nexample.org");
    expect(result).toMatchObject({ ok: true, domains: ["example.org"], skipped: 2 });
  });
});

describe("parseDomainList: CSV", () => {
  it("uses the Domain column and ignores others", () => {
    const text = 'Name,Domain,Notes\nAcme,acme.com,"hello, world"\nBeta,beta.org,x';
    const result = parseDomainList(text);
    expect(result).toMatchObject({ ok: true, format: "csv", domains: ["acme.com", "beta.org"] });
  });

  it("handles semicolons, quotes, and a URL column", () => {
    const text = '"URL";"Title"\n"https://one.example.com/a";"One"';
    expect(domainsOf(text)).toEqual(["one.example.com"]);
  });

  it("handles tab-separated files", () => {
    expect(domainsOf("Site\tOwner\nfoo.com\tbob")).toEqual(["foo.com"]);
  });
});

describe("parseDomainList: JSON", () => {
  it("reads an array of strings", () => {
    const result = parseDomainList('["a.com","https://b.org/x"]');
    expect(result).toMatchObject({ ok: true, format: "json", domains: ["a.com", "b.org"] });
  });

  it("reads an array of objects with common keys", () => {
    expect(domainsOf('[{"hostname":"a.com"},{"domain":"b.org"}]')).toEqual(["a.com", "b.org"]);
  });

  it("reads an object with a domains array", () => {
    expect(domainsOf('{"domains":["a.com","b.org"]}')).toEqual(["a.com", "b.org"]);
  });

  it("points LinkGuard backups to the backup importer", () => {
    const result = parseDomainList('{"format":"linkguard-backup","version":1,"domains":[]}');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("backup");
  });
});

describe("parseDomainList: limits and failures", () => {
  it("rejects an empty file", () => {
    expect(parseDomainList("   \n").ok).toBe(false);
  });

  it("rejects an oversized file", () => {
    expect(parseDomainList("a".repeat(MAX_LIST_BYTES + 1)).ok).toBe(false);
  });

  it("rejects a file with no valid domains", () => {
    expect(parseDomainList("hello world").ok).toBe(false);
  });

  it("stops collecting at 1000 unique domains and says so", () => {
    const text = Array.from({ length: 1500 }, (_, i) => `d${i}.example.com`).join("\n");
    const result = parseDomainList(text);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.domains).toHaveLength(1000);
      expect(result.truncated).toBe(true);
    }
  });
});