import { describe, it, expect } from "vitest";
import { parseScanRequest, MAX_URL_LENGTH } from "./validate-input";

describe("parseScanRequest", () => {
  it("accepts a valid url and trims whitespace", () => {
    expect(parseScanRequest({ url: "  https://example.com  " })).toEqual({
      ok: true,
      url: "https://example.com",
    });
  });

  it("ignores unknown extra fields", () => {
    const result = parseScanRequest({ url: "https://example.com", admin: true });
    expect(result.ok).toBe(true);
  });

  it.each([
    ["null", null],
    ["a string", "https://example.com"],
    ["a number", 42],
    ["an array", ["https://example.com"]],
  ])("rejects a body that is %s", (_name, body) => {
    expect(parseScanRequest(body).ok).toBe(false);
  });

  it.each([
    ["missing", {}],
    ["a number", { url: 123 }],
    ["an object", { url: { href: "https://example.com" } }],
    ["null", { url: null }],
  ])("rejects a url that is %s", (_name, body) => {
    expect(parseScanRequest(body).ok).toBe(false);
  });

  it("rejects empty and whitespace-only urls", () => {
    expect(parseScanRequest({ url: "" }).ok).toBe(false);
    expect(parseScanRequest({ url: "   " }).ok).toBe(false);
  });

  it("enforces the length limit exactly", () => {
    const atLimit = "a".repeat(MAX_URL_LENGTH);
    const overLimit = "a".repeat(MAX_URL_LENGTH + 1);
    expect(parseScanRequest({ url: atLimit }).ok).toBe(true);
    expect(parseScanRequest({ url: overLimit }).ok).toBe(false);
  });

  it("rejects control characters", () => {
    expect(parseScanRequest({ url: "https://exa\u0000mple.com" }).ok).toBe(false);
    expect(parseScanRequest({ url: "https://example.com/\nHost: evil" }).ok).toBe(false);
  });
});