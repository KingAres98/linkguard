import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { planDomainImport, readImportText, runImport, type ImportSource } from "./apply-import";
import { createBackup, serializeBackup } from "./backup";
import type { ScanReport } from "@/lib/scanner/types";
import { createIndexedDbStore } from "@/lib/storage/indexeddb-store";
import type { StoredScan } from "@/lib/storage/types";

const OWNER = "test-owner";

function report(label = "Needs Attention"): ScanReport {
  return {
    target: "https://example.com",
    scannedAt: "2026-10-01T00:00:00.000Z",
    findings: [],
    posture: { label },
  } as unknown as ScanReport;
}

function storedScan(scannedAt: string): StoredScan {
  return { id: scannedAt, domainId: "x", scannedAt, postureLabel: "Needs Attention", report: report() };
}

function listSource(domains: string[]): ImportSource {
  return { kind: "list", domains, skipped: 0, truncated: false };
}

function backupSource(hostname: string, scanTimes: string[]): ImportSource {
  const backup = createBackup([
    { hostname, createdAt: "2026-10-01T00:00:00.000Z", scans: scanTimes.map(storedScan) },
  ]);
  return { kind: "backup", backup };
}

const freshStore = () => createIndexedDbStore(`test-${crypto.randomUUID()}`);

describe("planDomainImport", () => {
  it("separates new, existing and duplicate domains", () => {
    const plan = planDomainImport(["a.com"], ["a.com", "b.com", "b.com", "c.com"]);
    expect(plan).toEqual({ toAdd: ["b.com", "c.com"], alreadyTracked: ["a.com"], overLimit: [] });
  });

  it("respects the domain limit", () => {
    const existing = Array.from({ length: 24 }, (_, i) => `site${i}.example.com`);
    const plan = planDomainImport(existing, ["x.com", "y.com", "z.com"]);
    expect(plan.toAdd).toEqual(["x.com"]);
    expect(plan.overLimit).toEqual(["y.com", "z.com"]);
  });
});

describe("readImportText", () => {
  it("accepts a valid backup", () => {
    const text = serializeBackup(createBackup([{ hostname: "example.com", createdAt: "2026-10-01T00:00:00.000Z", scans: [] }]));
    expect(readImportText(text, "backup")).toMatchObject({ ok: true, source: { kind: "backup" } });
  });

  it("accepts a domain list", () => {
    expect(readImportText("example.com\n", "list")).toMatchObject({
      ok: true,
      source: { kind: "list", domains: ["example.com"] },
    });
  });

  it("rejects the wrong kind of file", () => {
    const backupText = serializeBackup(createBackup([]));
    expect(readImportText(backupText, "list").ok).toBe(false);
    expect(readImportText("example.com\n", "backup").ok).toBe(false);
  });
});

describe("runImport with a domain list", () => {
  it("adds new domains and leaves existing ones alone", async () => {
    const store = freshStore();
    await store.addDomain(OWNER, "example.com");
    const summary = await runImport(store, OWNER, listSource(["example.com", "example.org"]), false);
    expect(summary).toMatchObject({ domainsAdded: 1, domainsAlreadyTracked: 1, domainsOverLimit: 0 });
    expect(await store.listDomains(OWNER)).toHaveLength(2);
  });

  it("counts domains that do not fit under the limit", async () => {
    const store = freshStore();
    for (let i = 0; i < 24; i++) await store.addDomain(OWNER, `site${i}.example.com`);
    const summary = await runImport(store, OWNER, listSource(["a.com", "b.com", "c.com"]), false);
    expect(summary).toMatchObject({ domainsAdded: 1, domainsOverLimit: 2 });
    expect(await store.listDomains(OWNER)).toHaveLength(25);
  });

  it("writes nothing on a dry run but reports the same counts", async () => {
    const store = freshStore();
    const summary = await runImport(store, OWNER, listSource(["a.com", "b.com"]), true);
    expect(summary.domainsAdded).toBe(2);
    expect(await store.listDomains(OWNER)).toHaveLength(0);
  });
});

describe("runImport with a backup", () => {
  it("imports history with the original timestamps, newest first", async () => {
    const store = freshStore();
    const source = backupSource("example.com", ["2026-01-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z"]);
    const summary = await runImport(store, OWNER, source, false);
    expect(summary).toMatchObject({ domainsAdded: 1, scansImported: 2 });

    const [domain] = await store.listDomains(OWNER);
    const scans = await store.listScans(OWNER, domain.id);
    expect(scans.map((s) => s.scannedAt)).toEqual([
      "2026-02-01T00:00:00.000Z",
      "2026-01-01T00:00:00.000Z",
    ]);
  });

  it("never overwrites the history of a domain that already has scans", async () => {
    const store = freshStore();
    const domain = await store.addDomain(OWNER, "example.com");
    await store.saveScan(OWNER, domain.id, report());

    const source = backupSource("example.com", ["2026-01-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z"]);
    const summary = await runImport(store, OWNER, source, false);
    expect(summary).toMatchObject({ domainsAlreadyTracked: 1, scansImported: 0, scansSkipped: 2 });
    expect(await store.listScans(OWNER, domain.id)).toHaveLength(1);
  });

  it("gives history to a tracked domain that has none", async () => {
    const store = freshStore();
    const domain = await store.addDomain(OWNER, "example.com");
    const source = backupSource("example.com", ["2026-01-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z"]);
    const summary = await runImport(store, OWNER, source, false);
    expect(summary).toMatchObject({ scansImported: 2, scansSkipped: 0 });
    expect(await store.listScans(OWNER, domain.id)).toHaveLength(2);
  });
});