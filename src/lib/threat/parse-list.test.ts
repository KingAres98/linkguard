import { describe, expect, it } from "vitest";
import { parseHostList } from "./parse-list";

describe("parseHostList", () => {
  it("reads one hostname per line", () => {
    expect(parseHostList("evil.com\nphish.example.org\n").hosts).toEqual([
      "evil.com",
      "phish.example.org",
    ]);
  });

  it("ignores comments and blank lines without counting them as skipped", () => {
    const result = parseHostList("# header\n\nevil.com # trailing note\n   \n");
    expect(result).toEqual({ hosts: ["evil.com"], skipped: 0 });
  });

  it("reads hosts-file style lines", () => {
    const result = parseHostList("0.0.0.0 evil.com\n127.0.0.1\tphish.example.org\n");
    expect(result.hosts).toEqual(["evil.com", "phish.example.org"]);
  });

  it("lowercases, strips trailing dots, and removes duplicates", () => {
    expect(parseHostList("EVIL.com\nevil.com.\nevil.com\n").hosts).toEqual(["evil.com"]);
  });

  it("handles Windows line endings", () => {
    expect(parseHostList("evil.com\r\nphish.example.org\r\n").hosts).toEqual([
      "evil.com",
      "phish.example.org",
    ]);
  });

  it("skips lines that are not hostnames, and counts them", () => {
    const result = parseHostList(
      [
        "http://evil.com/login", // a URL
        "203.0.113.9", // an IP address
        "-bad-.com", // label starts with a hyphen
        "under_score.example.com", // character not allowed in a hostname
        "two words.com", // not a hostname or a hosts-file line
        "intranet", // a single label
        "good.example.com",
      ].join("\n"),
    );
    expect(result.hosts).toEqual(["good.example.com"]);
    expect(result.skipped).toBe(6);
  });

  it("skips public suffixes, because listing one would flag every site under it", () => {
    const result = parseHostList("co.uk\ngithub.io\nevil.github.io\n");
    expect(result.hosts).toEqual(["evil.github.io"]);
    expect(result.skipped).toBe(2);
  });

  it("skips over-long labels and over-long lines", () => {
    const longLabel = `${"a".repeat(64)}.com`;
    const longLine = `${"a".repeat(400)}.com`;
    const result = parseHostList(`${longLabel}\n${longLine}\nok.example.com\n`);
    expect(result.hosts).toEqual(["ok.example.com"]);
    expect(result.skipped).toBe(2);
  });
});