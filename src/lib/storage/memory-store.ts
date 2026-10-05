import { randomUUID } from "node:crypto";
import type { ScanReport } from "@/lib/scanner/types";
import type { ScanStore, StoredScan, TrackedDomain } from "./types";

const DEFAULT_SCAN_LIMIT = 50;

export function createMemoryStore(): ScanStore {
  const domains: TrackedDomain[] = [];
  let scans: StoredScan[] = []; // insertion order = oldest first

  function findDomain(ownerId: string, domainId: string): TrackedDomain | null {
    return domains.find((d) => d.id === domainId && d.ownerId === ownerId) ?? null;
  }

  return {
    async addDomain(ownerId, hostname) {
      const existing = domains.find((d) => d.ownerId === ownerId && d.hostname === hostname);
      if (existing) return existing;
      const domain: TrackedDomain = {
        id: randomUUID(),
        ownerId,
        hostname,
        createdAt: new Date().toISOString(),
      };
      domains.push(domain);
      return domain;
    },

    async listDomains(ownerId) {
      return domains.filter((d) => d.ownerId === ownerId);
    },

    async getDomain(ownerId, domainId) {
      return findDomain(ownerId, domainId);
    },

    async removeDomain(ownerId, domainId) {
      const domain = findDomain(ownerId, domainId);
      if (!domain) return false;
      domains.splice(domains.indexOf(domain), 1);
      scans = scans.filter((s) => s.domainId !== domainId);
      return true;
    },

    async saveScan(ownerId, domainId, report: ScanReport) {
      if (!findDomain(ownerId, domainId)) {
        throw new Error("Domain not found");
      }
      const scan: StoredScan = {
        id: randomUUID(),
        domainId,
        scannedAt: report.scannedAt,
        postureLabel: report.posture.label,
        report,
      };
      scans.push(scan);
      return scan;
    },

    async listScans(ownerId, domainId, limit = DEFAULT_SCAN_LIMIT) {
      if (!findDomain(ownerId, domainId)) return [];
      return scans
        .filter((s) => s.domainId === domainId)
        .reverse()
        .slice(0, limit);
    },
  };
}