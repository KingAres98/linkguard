import type { ScanReport } from "@/lib/scanner/types";

export interface TrackedDomain {
  id: string;
  ownerId: string;
  hostname: string;
  createdAt: string; // ISO 8601
}

/** Each tracked domain keeps only its newest scans; older ones are deleted on save. */
export const MAX_SCANS_PER_DOMAIN = 20;

export interface StoredScan {
  id: string;
  domainId: string;
  scannedAt: string; // ISO 8601
  postureLabel: string;
  report: ScanReport;
}

/**
 * The only thing the dashboard knows about storage. Every method takes an
 * ownerId so one owner can never reach another owner's data. Right now
 * there is a single fixed owner; when accounts exist, the real user ID is
 * passed here and nothing else changes.
 */
export interface ScanStore {
  /** Adds a domain. Adding the same hostname twice returns the existing one. */
  addDomain(ownerId: string, hostname: string): Promise<TrackedDomain>;
  listDomains(ownerId: string): Promise<TrackedDomain[]>;
  getDomain(ownerId: string, domainId: string): Promise<TrackedDomain | null>;
  /** Removes a domain and all of its scans. Returns false if it wasn't found. */
  removeDomain(ownerId: string, domainId: string): Promise<boolean>;
  /** Throws if the domain doesn't exist for this owner. */
  saveScan(ownerId: string, domainId: string, report: ScanReport): Promise<StoredScan>;
  /** Newest first. Returns [] if the domain doesn't exist for this owner. */
  listScans(ownerId: string, domainId: string, limit?: number): Promise<StoredScan[]>;
  /**
   * Deletes every saved scan for a domain but keeps the domain itself.
   * Returns how many scans were deleted (0 if the domain isn't this owner's).
   */
  clearScans(ownerId: string, domainId: string): Promise<number>;
}