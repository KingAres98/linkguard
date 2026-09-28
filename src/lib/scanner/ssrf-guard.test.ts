import { describe, it, expect } from "vitest";
import { resolveAndValidateHost } from "./ssrf-guard";

describe("resolveAndValidateHost", () => {
  it("blocks a literal loopback IP without needing DNS", async () => {
    const result = await resolveAndValidateHost("127.0.0.1");
    expect(result.safe).toBe(false);
  });

  it("blocks a literal private IP", async () => {
    const result = await resolveAndValidateHost("192.168.1.1");
    expect(result.safe).toBe(false);
  });

  it("blocks the literal cloud metadata address", async () => {
    const result = await resolveAndValidateHost("169.254.169.254");
    expect(result.safe).toBe(false);
  });

  it("blocks localhost by name", async () => {
    const result = await resolveAndValidateHost("localhost");
    expect(result.safe).toBe(false);
  });

  it("allows a real public hostname", async () => {
    const result = await resolveAndValidateHost("example.com");
    expect(result.safe).toBe(true);
    if (result.safe) {
      expect(result.resolvedIps.length).toBeGreaterThan(0);
    }
  });

  it("fails closed for a hostname that cannot be resolved", async () => {
    const result = await resolveAndValidateHost("this-domain-should-not-exist-linkguard.invalid");
    expect(result.safe).toBe(false);
  });
});