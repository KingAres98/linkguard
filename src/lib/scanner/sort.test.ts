import { describe, it, expect } from "vitest";
import { runScan } from "./scan";

describe("runScan", () => {
  it("returns a report with a normalized target", async () => {
    const result = await runScan("https://example.com");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.target).toBe("https://example.com/");
    expect(result.report.findings.length).toBeGreaterThan(0);
    expect(new Date(result.report.scannedAt).toISOString()).toBe(result.report.scannedAt);
  });

  it("includes an SSRF allow finding for a public target", async () => {
    const result = await runScan("https://example.com");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const finding = result.report.findings.find((f) => f.id === "ssrf.target.allowed");
    expect(finding?.status).toBe("info");
  });

  it("blocks a loopback target with a fail finding instead of erroring out", async () => {
    const result = await runScan("http://127.0.0.1");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const finding = result.report.findings.find((f) => f.id === "ssrf.target.blocked");
    expect(finding?.status).toBe("fail");
    expect(finding?.severity).toBe("high");
  });

  it("blocks the cloud metadata address", async () => {
    const result = await runScan("http://169.254.169.254");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.report.findings.some((f) => f.id === "ssrf.target.blocked"),
    ).toBe(true);
  });

  it("blocks localhost by name", async () => {
    const result = await runScan("http://localhost");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(
      result.report.findings.some((f) => f.id === "ssrf.target.blocked"),
    ).toBe(true);
  });

  it("strips credentials from the displayed target and the whole report", async () => {
    const result = await runScan("https://user:s3cr3t-value@example.com/x");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.target).toBe("https://example.com/x");
    expect(JSON.stringify(result.report)).not.toContain("s3cr3t-value");
  });

  it("returns an error for unsupported schemes", async () => {
    const result = await runScan("javascript:alert(1)");
    expect(result.ok).toBe(false);
  });
});