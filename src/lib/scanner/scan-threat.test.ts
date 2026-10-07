import { describe, expect, it } from "vitest";
import { createSqliteThreatIndex, openThreatDatabase } from "@/lib/threat/sqlite-threat-index";
import { runScan } from "./scan";

async function indexWith(...hosts: string[]) {
  const index = createSqliteThreatIndex(openThreatDatabase(":memory:"));
  await index.replaceSource("phishing-database", hosts, new Date().toISOString());
  return index;
}

describe("runScan threat intelligence", () => {
  it("labels a listed target 'Known Threat Listing'", async () => {
    const threatIndex = await indexWith("example.com");
    const result = await runScan("https://example.com", { threatIndex });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.report.posture.label).toBe("Known Threat Listing");
    expect(result.report.posture.drivenByFindingId).toBe("threat.listed");
  }, 20000);

  it("adds a 'not listed' finding when fresh feeds do not list the target", async () => {
    const threatIndex = await indexWith("evil.com");
    const result = await runScan("https://example.com", { threatIndex });
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    const threat = result.report.findings.find((f) => f.category === "threat");
    expect(threat?.id).toBe("threat.not-listed");
  }, 20000);
});