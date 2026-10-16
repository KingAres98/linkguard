import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { createIndexedDbStore } from "./indexeddb-store";
import { MAX_SCANS_PER_DOMAIN } from "./types";
import type { ScanReport } from "@/lib/scanner/types";

const OWNER = "owner-a";

function report(label: string): ScanReport {
  return {
    target: "https://example.com",
    scannedAt: "2026-10-01T00:00:00.000Z",
    findings: [],
    posture: { label },
  } as unknown as ScanReport;
}

async function setup() {
  const store = createIndexedDbStore(`test-${crypto.randomUUID()}`);
  const domain = await store.addDomain(OWNER, "example.com");
  return { store, domain };
}

describe("IndexedDB importScan", () => {
  it("keeps the original timestamp and derives the posture label from the report", async () => {
    const { store, domain } = await setup();
    const saved = await store.importScan(OWNER, domain.id, {
      scannedAt: "2026-01-01T00:00:00.000Z",
      report: report("Needs Attention"),
    });
    expect(saved.scannedAt).toBe("2026-01-01T00:00:00.000Z");
    expect(saved.postureLabel).toBe("Needs Attention");
  });

  it("lists imported scans newest first when imported oldest first", async () => {
    const { store, domain } = await setup();
    for (const day of ["01", "02", "03"]) {
      await store.importScan(OWNER, domain.id, {
        scannedAt: `2026-01-${day}T00:00:00.000Z`,
        report: report("Needs Attention"),
      });
    }
    const scans = await store.listScans(OWNER, domain.id);
    expect(scans.map((s) => s.scannedAt)).toEqual([
      "2026-01-03T00:00:00.000Z",
      "2026-01-02T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    ]);
  });

  it("refuses unknown domains and other owners' domains", async () => {
    const { store, domain } = await setup();
    const scan = { scannedAt: "2026-01-01T00:00:00.000Z", report: report("Needs Attention") };
    await expect(store.importScan(OWNER, "missing", scan)).rejects.toThrow("Domain not found");
    await expect(store.importScan("owner-b", domain.id, scan)).rejects.toThrow("Domain not found");
  });

  it("applies the retention limit, dropping the oldest", async () => {
    const { store, domain } = await setup();
    const total = MAX_SCANS_PER_DOMAIN + 3;
    for (let i = 0; i < total; i++) {
      await store.importScan(OWNER, domain.id, {
        scannedAt: `2026-01-01T00:00:${String(i).padStart(2, "0")}.000Z`,
        report: report("Needs Attention"),
      });
    }
    const scans = await store.listScans(OWNER, domain.id, 100);
    expect(scans).toHaveLength(MAX_SCANS_PER_DOMAIN);
    expect(scans[scans.length - 1].scannedAt).toBe("2026-01-01T00:00:03.000Z");
  });
});