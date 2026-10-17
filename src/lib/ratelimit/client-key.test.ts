import { describe, expect, it } from "vitest";
import { clientKeyFromRequest } from "./client-key";

function req(headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/scan", { method: "POST", headers });
}

describe("clientKeyFromRequest", () => {
  it("is 'unknown' when no header is configured", () => {
    expect(clientKeyFromRequest(req({ "x-forwarded-for": "203.0.113.5" }), undefined)).toBe("unknown");
  });

  it("reads a single IP from the configured header", () => {
    expect(clientKeyFromRequest(req({ "cf-connecting-ip": "203.0.113.5" }), "cf-connecting-ip")).toBe(
      "203.0.113.5",
    );
  });

  it("takes the last entry of a forwarding chain, not the spoofable first", () => {
    const request = req({ "x-forwarded-for": "6.6.6.6, 203.0.113.5" });
    expect(clientKeyFromRequest(request, "x-forwarded-for")).toBe("203.0.113.5");
  });

  it("accepts IPv6 addresses", () => {
    expect(clientKeyFromRequest(req({ "cf-connecting-ip": "2001:db8::1" }), "cf-connecting-ip")).toBe(
      "2001:db8::1",
    );
  });

  it("falls back to 'unknown' for missing or malformed values", () => {
    expect(clientKeyFromRequest(req(), "cf-connecting-ip")).toBe("unknown");
    expect(clientKeyFromRequest(req({ "cf-connecting-ip": "not an ip!" }), "cf-connecting-ip")).toBe("unknown");
    expect(clientKeyFromRequest(req({ "cf-connecting-ip": "1".repeat(100) }), "cf-connecting-ip")).toBe("unknown");
  });

  it("does not crash on an invalid configured header name", () => {
    expect(clientKeyFromRequest(req(), "bad header name")).toBe("unknown");
  });
});