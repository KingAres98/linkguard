import { describe, expect, it } from "vitest";
import { buildCsp, buildSecurityHeaders } from "./headers";

function names(production: boolean): string[] {
  return buildSecurityHeaders(production).map((h) => h.key);
}

describe("buildSecurityHeaders", () => {
  it("sends the full set in production", () => {
    expect(names(true)).toEqual(
      expect.arrayContaining([
        "Content-Security-Policy",
        "X-Content-Type-Options",
        "X-Frame-Options",
        "Referrer-Policy",
        "Permissions-Policy",
        "Cross-Origin-Opener-Policy",
        "Cross-Origin-Resource-Policy",
        "Strict-Transport-Security",
      ]),
    );
  });

  it("leaves HSTS out of development", () => {
    expect(names(false)).not.toContain("Strict-Transport-Security");
  });

  it("never sends an empty header", () => {
    for (const header of [...buildSecurityHeaders(true), ...buildSecurityHeaders(false)]) {
      expect(header.key.length).toBeGreaterThan(0);
      expect(header.value.length).toBeGreaterThan(0);
    }
  });
});

describe("buildCsp", () => {
  it("blocks framing, plugins, base tag changes and off-site form posts", () => {
    const csp = buildCsp(true);
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
    expect(csp).toContain("form-action 'self'");
  });

  it("allows no remote origins", () => {
    expect(buildCsp(true)).not.toMatch(/https?:\/\//);
    expect(buildCsp(false)).not.toMatch(/https?:\/\//);
  });

  it("allows eval and sockets only in development", () => {
    expect(buildCsp(false)).toContain("'unsafe-eval'");
    expect(buildCsp(false)).toContain("ws:");
    expect(buildCsp(true)).not.toContain("'unsafe-eval'");
    expect(buildCsp(true)).not.toContain("ws:");
    expect(buildCsp(true)).toContain("upgrade-insecure-requests");
  });
});