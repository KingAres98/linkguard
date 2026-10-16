import { describe, expect, it } from "vitest";
import { exportFilename, toCsv, toPlainList, type ExportRow } from "./export-formats";

const ROWS: ExportRow[] = [
  {
    hostname: "example.com",
    addedAt: "2026-10-01T00:00:00.000Z",
    latestPosture: "Good Configuration — Minor Notes",
    lastScannedAt: "2026-10-16T12:00:00.000Z",
  },
  { hostname: "example.org", addedAt: "2026-10-02T00:00:00.000Z", latestPosture: null, lastScannedAt: null },
];

describe("toPlainList", () => {
  it("writes one hostname per line", () => {
    expect(toPlainList(ROWS)).toBe("example.com\nexample.org\n");
  });

  it("writes nothing for an empty list", () => {
    expect(toPlainList([])).toBe("");
  });
});

describe("toCsv", () => {
  it("writes a header and one row per domain, with empty cells for unscanned domains", () => {
    expect(toCsv(ROWS)).toBe(
      "domain,added_at,latest_posture,last_scanned_at\r\n" +
        "example.com,2026-10-01T00:00:00.000Z,Good Configuration — Minor Notes,2026-10-16T12:00:00.000Z\r\n" +
        "example.org,2026-10-02T00:00:00.000Z,,\r\n",
    );
  });

  it("quotes cells containing commas and quotes", () => {
    const csv = toCsv([{ ...ROWS[1], latestPosture: 'Says "hi", twice' }]);
    expect(csv).toContain('"Says ""hi"", twice"');
  });

  it("defuses spreadsheet formulas", () => {
    const csv = toCsv([{ ...ROWS[1], latestPosture: "=HYPERLINK(1)" }]);
    expect(csv).toContain(",'=HYPERLINK(1),");
  });
});

describe("exportFilename", () => {
  it("builds dated filenames for each kind", () => {
    const day = new Date("2026-10-16T23:59:00.000Z");
    expect(exportFilename("backup", day)).toBe("linkguard-backup-2026-10-16.json");
    expect(exportFilename("domains-list", day)).toBe("linkguard-domains-list-2026-10-16.txt");
    expect(exportFilename("domains-csv", day)).toBe("linkguard-domains-csv-2026-10-16.csv");
  });
});