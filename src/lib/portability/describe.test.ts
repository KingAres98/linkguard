import { describe, expect, it } from "vitest";
import type { ImportSummary } from "./apply-import";
import { describeImport, hasChanges } from "./describe";

function summary(overrides: Partial<ImportSummary> = {}): ImportSummary {
  return {
    domainsAdded: 0,
    domainsAlreadyTracked: 0,
    domainsOverLimit: 0,
    scansImported: 0,
    scansSkipped: 0,
    linesSkipped: 0,
    truncated: false,
    ...overrides,
  };
}

describe("describeImport", () => {
  it("uses future tense for a preview", () => {
    const lines = describeImport(summary({ domainsAdded: 4, scansImported: 6 }), "preview");
    expect(lines).toEqual([
      "Will add 4 new domains.",
      "Will import 6 saved scans with their original dates.",
    ]);
  });

  it("uses past tense for the result", () => {
    const lines = describeImport(summary({ domainsAdded: 1, scansImported: 1 }), "result");
    expect(lines).toEqual([
      "Added 1 new domain.",
      "Imported 1 saved scan with their original dates.",
    ]);
  });

  it("explains what was left unchanged, left out, or skipped", () => {
    const text = describeImport(
      summary({
        domainsAdded: 1,
        domainsAlreadyTracked: 2,
        scansSkipped: 3,
        domainsOverLimit: 1,
        linesSkipped: 5,
        truncated: true,
      }),
      "preview",
    ).join("\n");
    expect(text).toContain("2 domains already tracked here, left unchanged.");
    expect(text).toContain("3 scans for domains that already have history");
    expect(text).toContain("1 domain (LinkGuard tracks at most 25 domains here)");
    expect(text).toContain("5 lines in the file had no usable domain name and will be skipped.");
    expect(text).toContain("only the first 1000 were read");
  });

  it("says so when there is nothing to import", () => {
    const empty = summary({ domainsAlreadyTracked: 2 });
    expect(hasChanges(empty)).toBe(false);
    expect(describeImport(empty, "preview")[0]).toBe("Nothing new to import.");
  });

  it("counts a scan-only import as a change", () => {
    expect(hasChanges(summary({ scansImported: 2 }))).toBe(true);
  });
});