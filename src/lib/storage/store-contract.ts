import { describe, it, expect, beforeEach } from "vitest";
import type { ScanReport } from "@/lib/scanner/types";
import { MAX_SCANS_PER_DOMAIN, type ScanStore } from "./types";

function makeReport(target: string, label = "Needs Attention"): ScanReport {
  return {
    target,
    scannedAt: new Date().toISOString(),
    findings: [],
    posture: { label },
  };
}

/** Every ScanStore implementation must pass these tests. */
export function runStoreContract(name: string, createStore: () => ScanStore | Promise<ScanStore>) {
  describe(`ScanStore contract: ${name}`, () => {
    let store: ScanStore;

    beforeEach(async () => {
      store = await createStore();
    });

    it("adds a domain and lists it", async () => {
      const domain = await store.addDomain("owner-a", "example.com");
      expect(domain.hostname).toBe("example.com");
      expect(await store.listDomains("owner-a")).toEqual([domain]);
    });

    it("returns the existing domain instead of adding a duplicate", async () => {
      const first = await store.addDomain("owner-a", "example.com");
      const second = await store.addDomain("owner-a", "example.com");
      expect(second.id).toBe(first.id);
      expect(await store.listDomains("owner-a")).toHaveLength(1);
    });

    it("keeps the same hostname separate for different owners", async () => {
      const a = await store.addDomain("owner-a", "example.com");
      const b = await store.addDomain("owner-b", "example.com");
      expect(a.id).not.toBe(b.id);
    });

    it("never shows one owner another owner's domains", async () => {
      const domain = await store.addDomain("owner-a", "example.com");
      expect(await store.listDomains("owner-b")).toEqual([]);
      expect(await store.getDomain("owner-b", domain.id)).toBeNull();
    });

    it("refuses to remove another owner's domain", async () => {
      const domain = await store.addDomain("owner-a", "example.com");
      expect(await store.removeDomain("owner-b", domain.id)).toBe(false);
      expect(await store.getDomain("owner-a", domain.id)).not.toBeNull();
    });

    it("saves scans and lists them newest first", async () => {
      const domain = await store.addDomain("owner-a", "example.com");
      await store.saveScan("owner-a", domain.id, makeReport("first"));
      await store.saveScan("owner-a", domain.id, makeReport("second"));
      const scans = await store.listScans("owner-a", domain.id);
      expect(scans.map((s) => s.report.target)).toEqual(["second", "first"]);
    });

    it("respects the scan list limit", async () => {
      const domain = await store.addDomain("owner-a", "example.com");
      for (let i = 0; i < 5; i++) {
        await store.saveScan("owner-a", domain.id, makeReport(`scan-${i}`));
      }
      expect(await store.listScans("owner-a", domain.id, 2)).toHaveLength(2);
    });

    it("records the posture label alongside each scan", async () => {
      const domain = await store.addDomain("owner-a", "example.com");
      const scan = await store.saveScan("owner-a", domain.id, makeReport("x", "Critical Issues Found"));
      expect(scan.postureLabel).toBe("Critical Issues Found");
    });

    it("refuses to save a scan for another owner's domain", async () => {
      const domain = await store.addDomain("owner-a", "example.com");
      await expect(store.saveScan("owner-b", domain.id, makeReport("x"))).rejects.toThrow();
      expect(await store.listScans("owner-a", domain.id)).toEqual([]);
    });

    it("returns no scans for another owner or an unknown domain", async () => {
      const domain = await store.addDomain("owner-a", "example.com");
      await store.saveScan("owner-a", domain.id, makeReport("x"));
      expect(await store.listScans("owner-b", domain.id)).toEqual([]);
      expect(await store.listScans("owner-a", "no-such-id")).toEqual([]);
    });

    it("removes a domain together with its scans", async () => {
      const domain = await store.addDomain("owner-a", "example.com");
      await store.saveScan("owner-a", domain.id, makeReport("x"));
      expect(await store.removeDomain("owner-a", domain.id)).toBe(true);
      expect(await store.listDomains("owner-a")).toEqual([]);
      expect(await store.listScans("owner-a", domain.id)).toEqual([]);
    });
    
    it("keeps only the newest scans per domain (retention)", async () => {
      const domain = await store.addDomain("owner-a", "example.com");
      for (let i = 0; i < MAX_SCANS_PER_DOMAIN + 3; i++) {
        await store.saveScan("owner-a", domain.id, makeReport(`scan-${i}`));
      }
      const scans = await store.listScans("owner-a", domain.id, 1000);
      expect(scans).toHaveLength(MAX_SCANS_PER_DOMAIN);
      expect(scans[0].report.target).toBe(`scan-${MAX_SCANS_PER_DOMAIN + 2}`); // newest kept
      expect(scans[scans.length - 1].report.target).toBe("scan-3"); // oldest kept
    });

    it("prunes one domain without touching another domain's scans", async () => {
      const a = await store.addDomain("owner-a", "a.example.com");
      const b = await store.addDomain("owner-a", "b.example.com");
      await store.saveScan("owner-a", b.id, makeReport("b-only"));
      for (let i = 0; i < MAX_SCANS_PER_DOMAIN + 2; i++) {
        await store.saveScan("owner-a", a.id, makeReport(`a-${i}`));
      }
      const bScans = await store.listScans("owner-a", b.id, 1000);
      expect(bScans.map((s) => s.report.target)).toEqual(["b-only"]);
    });

    it("clears a domain's scans, reports how many, and keeps the domain", async () => {
      const domain = await store.addDomain("owner-a", "example.com");
      for (let i = 0; i < 3; i++) {
        await store.saveScan("owner-a", domain.id, makeReport(`scan-${i}`));
      }
      expect(await store.clearScans("owner-a", domain.id)).toBe(3);
      expect(await store.listScans("owner-a", domain.id)).toEqual([]);
      expect(await store.getDomain("owner-a", domain.id)).not.toBeNull();
    });

    it("clearing one domain's scans leaves other domains alone", async () => {
      const a = await store.addDomain("owner-a", "a.example.com");
      const b = await store.addDomain("owner-a", "b.example.com");
      await store.saveScan("owner-a", a.id, makeReport("a"));
      await store.saveScan("owner-a", b.id, makeReport("b"));
      await store.clearScans("owner-a", a.id);
      expect(await store.listScans("owner-a", b.id)).toHaveLength(1);
    });

    it("refuses to clear another owner's scans", async () => {
      const domain = await store.addDomain("owner-a", "example.com");
      await store.saveScan("owner-a", domain.id, makeReport("x"));
      expect(await store.clearScans("owner-b", domain.id)).toBe(0);
      expect(await store.listScans("owner-a", domain.id)).toHaveLength(1);
    });
  });
}