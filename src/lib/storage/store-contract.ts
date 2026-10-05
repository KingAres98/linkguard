import { describe, it, expect, beforeEach } from "vitest";
import type { ScanReport } from "@/lib/scanner/types";
import type { ScanStore } from "./types";

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
  });
}