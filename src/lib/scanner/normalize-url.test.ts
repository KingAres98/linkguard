import { describe, it, expect } from "vitest";
import { normalizeUrl } from "./normalize-url";

function parse(input: string) {
  const result = normalizeUrl(input);
  if (!result.ok) throw new Error(`expected ok, got: ${result.error}`);
  return result;
}

describe("normalizeUrl", () => {
  it("accepts an explicit https URL", () => {
    const result = parse("https://example.com");
    expect(result.url.hostname).toBe("example.com");
    expect(result.schemeAssumed).toBe(false);
  });

  it("assumes https when no scheme is given", () => {
    const result = parse("example.com");
    expect(result.url.protocol).toBe("https:");
    expect(result.schemeAssumed).toBe(true);
  });

  it("treats host:port without a scheme as a host and port", () => {
    const result = parse("example.com:8080/path");
    expect(result.url.hostname).toBe("example.com");
    expect(result.url.port).toBe("8080");
  });

  it("lowercases the scheme and host", () => {
    const result = parse("HTTP://EXAMPLE.COM");
    expect(result.url.protocol).toBe("http:");
    expect(result.url.hostname).toBe("example.com");
  });

  it("drops the default port", () => {
    expect(parse("https://example.com:443").url.port).toBe("");
  });

  it.each([
    ["javascript:", "javascript:alert(1)"],
    ["mailto:", "mailto:someone@example.com"],
    ["data:", "data:text/html,hi"],
    ["file://", "file:///etc/passwd"],
    ["ftp://", "ftp://example.com"],
  ])("rejects the %s scheme", (_name, input) => {
    expect(normalizeUrl(input).ok).toBe(false);
  });

  it.each([
    ["a space in the host", "exa mple.com"],
    ["an empty host", "http://"],
  ])("rejects malformed input: %s", (_name, input) => {
    expect(normalizeUrl(input).ok).toBe(false);
  });

  it.each([
    ["decimal integer", "http://2130706433"],
    ["hexadecimal", "http://0x7f.0.0.1"],
    ["shortened", "http://127.1"],
  ])("canonicalizes %s IPv4 notation to a dotted quad", (_name, input) => {
    const result = normalizeUrl(input);
    expect(result.ok && result.url.hostname).toBe("127.0.0.1");
  });

  it("converts internationalized hostnames to punycode", () => {
    expect(parse("https://xn--mnchen-3ya.de").url.hostname).toBe("xn--mnchen-3ya.de");
  });

  it("separates embedded credentials from the real host", () => {
    const result = parse("https://paypal.com@evil.test");
    expect(result.url.hostname).toBe("evil.test");
    expect(result.url.username).toBe("paypal.com");
  });
});