import { describe, expect, it } from "vitest";
import type { StoredScan } from "@/lib/storage/types";
import type { ScanReport } from "@/lib/scanner/types";
import { toExportRows } from "./export-rows";

function scan(scannedAt: string, postureLabel: string): StoredScan {
  return { id: scannedAt, domainId: "x", scannedAt, postureLabel, report: {} as ScanReport };
}

describe("toExportRows", () => {
  it("uses the most recent scan whatever order the scans arrive in", () => {
    const [row] = toExportRows([
      {
        hostname: "example.com",
        createdAt: "2026-10-01T00:00:00.000Z",
        scans: [
          scan("2026-10-10T00:00:00.000Z", "Newest"),
          scan("2026-10-05T00:00:00.000Z", "Older"),
        ],
      },
    ]);
    expect(row).toEqual({
      hostname: "example.com",
      addedAt: "2026-10-01T00:00:00.000Z",
      latestPosture: "Newest",
      lastScannedAt: "2026-10-10T00:00:00.000Z",
    });
  });

  it("leaves scan fields empty for a domain that was never scanned", () => {
    const [row] = toExportRows([
      { hostname: "example.org", createdAt: "2026-10-01T00:00:00.000Z", scans: [] },
    ]);
    expect(row.latestPosture).toBeNull();
    expect(row.lastScannedAt).toBeNull();
  });
});