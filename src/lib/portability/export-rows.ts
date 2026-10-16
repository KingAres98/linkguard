import type { StoredScan } from "@/lib/storage/types";
import type { ExportableDomain } from "./backup";
import type { ExportRow } from "./export-formats";

/** Turns exported domains into the one-row-per-domain shape the list and CSV exports use. */
export function toExportRows(domains: ExportableDomain[]): ExportRow[] {
  return domains.map((domain) => {
    const latest = domain.scans.reduce<StoredScan | null>(
      (best, scan) => (best === null || scan.scannedAt > best.scannedAt ? scan : best),
      null,
    );
    return {
      hostname: domain.hostname,
      addedAt: domain.createdAt,
      latestPosture: latest?.postureLabel ?? null,
      lastScannedAt: latest?.scannedAt ?? null,
    };
  });
}