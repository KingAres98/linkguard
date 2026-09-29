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
    it("fetches the target once the safety check passes, and reports the response", async () => {
    const result = await runScan("https://example.com");
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const finding = result.report.findings.find((f) => f.id.startsWith("http."));
    expect(finding).toBeDefined();
  }, 15000);
});