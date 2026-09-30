import { describe, it, expect } from "vitest";
import { checkSecurityHeaders } from "./header-checker";
import type { Finding } from "../types";

function idOf(findings: Finding[], id: string): Finding | undefined {
  return findings.find((f) => f.id === id);
}

describe("checkSecurityHeaders", () => {
  it("reports HSTS as not-applicable over plain HTTP regardless of headers", () => {
    const findings = checkSecurityHeaders({ "strict-transport-security": "max-age=31536000" }, false);
    expect(idOf(findings, "headers.hsts.not-applicable")?.status).toBe("info");
    expect(idOf(findings, "headers.hsts.present")).toBeUndefined();
  });

  it("flags missing HSTS over https", () => {
    const findings = checkSecurityHeaders({}, true);
    expect(idOf(findings, "headers.hsts.missing")?.status).toBe("warning");
  });

  it("flags a short HSTS max-age", () => {
    const findings = checkSecurityHeaders({ "strict-transport-security": "max-age=60" }, true);
    expect(idOf(findings, "headers.hsts.short-max-age")?.status).toBe("warning");
  });

  it("passes a strong HSTS header", () => {
    const findings = checkSecurityHeaders(
      { "strict-transport-security": "max-age=31536000; includeSubDomains" },
      true,
    );
    expect(idOf(findings, "headers.hsts.present")?.status).toBe("pass");
  });

  it("flags missing CSP with a limitations note about how common that is", () => {
    const findings = checkSecurityHeaders({}, true);
    const csp = idOf(findings, "headers.csp.missing");
    expect(csp?.status).toBe("warning");
    expect(csp?.limitations).toBeTruthy();
  });

  it("flags a CSP that allows unsafe-inline scripts", () => {
    const findings = checkSecurityHeaders(
      { "content-security-policy": "default-src 'self'; script-src 'self' 'unsafe-inline'" },
      true,
    );
    expect(idOf(findings, "headers.csp.weak")?.status).toBe("warning");
  });

  it("passes a reasonably strict CSP", () => {
    const findings = checkSecurityHeaders(
      { "content-security-policy": "default-src 'self'; script-src 'self'" },
      true,
    );
    expect(idOf(findings, "headers.csp.present")?.status).toBe("pass");
  });

  it("passes X-Content-Type-Options only when set to nosniff", () => {
    expect(idOf(checkSecurityHeaders({ "x-content-type-options": "nosniff" }, true), "headers.xcto.present")?.status).toBe("pass");
    expect(idOf(checkSecurityHeaders({ "x-content-type-options": "something-else" }, true), "headers.xcto.missing")?.status).toBe("warning");
    expect(idOf(checkSecurityHeaders({}, true), "headers.xcto.missing")?.status).toBe("warning");
  });

  it("accepts a CSP frame-ancestors directive as equivalent frame protection", () => {
    const findings = checkSecurityHeaders(
      { "content-security-policy": "frame-ancestors 'self'" },
      true,
    );
    expect(idOf(findings, "headers.frame-protection.present")?.status).toBe("pass");
  });

  it("flags missing frame protection when neither header is present", () => {
    const findings = checkSecurityHeaders({}, true);
    expect(idOf(findings, "headers.frame-protection.missing")?.status).toBe("warning");
  });

  it("treats missing Referrer-Policy and Permissions-Policy as low-severity info, not warnings", () => {
    const findings = checkSecurityHeaders({}, true);
    expect(idOf(findings, "headers.referrer-policy.missing")?.severity).toBe("info");
    expect(idOf(findings, "headers.permissions-policy.missing")?.severity).toBe("info");
  });

  it("is a pure function: the same input always produces the same output", () => {
    const headers = { "strict-transport-security": "max-age=31536000" };
    expect(checkSecurityHeaders(headers, true)).toEqual(checkSecurityHeaders(headers, true));
  });
});