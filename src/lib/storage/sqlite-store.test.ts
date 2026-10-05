import { describe, it, expect } from "vitest";
import type { ScanReport } from "@/lib/scanner/types";
import { createSqliteStore, openDatabase } from "./sqlite-store";
import { runStoreContract } from "./store-contract";

// Same 11 tests the in-memory store passes, each on a fresh database.
runStoreContract("sqlite", () => createSqliteStore(openDatabase(":memory:")));

function makeReport(target: string): ScanReport {
  return {
    target,
    scannedAt: new Date().toISOString(),
    findings: [],
    posture: { label: "Needs Attention" },
  };
}

describe("sqlite-specific behavior", () => {
  it("stores a hostile-looking hostname as plain data (no SQL injection)", async () => {
    const db = openDatabase(":memory:");
    const store = createSqliteStore(db);
    const evil = "x'; DROP TABLE domains; --";

    const domain = await store.addDomain("owner-a", evil);

    expect(domain.hostname).toBe(evil);
    // The tables must still exist and hold exactly what we expect.
    expect(await store.listDomains("owner-a")).toHaveLength(1);
  });

  it("actually deletes scan rows when a domain is removed (cascade is on)", async () => {
    const db = openDatabase(":memory:");
    const store = createSqliteStore(db);
    const domain = await store.addDomain("owner-a", "example.com");
    await store.saveScan("owner-a", domain.id, makeReport("x"));

    await store.removeDomain("owner-a", domain.id);

    const row = db.prepare("SELECT COUNT(*) AS n FROM scans").get() as { n: number };
    expect(row.n).toBe(0);
  });
});