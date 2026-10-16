import { requestJson, type ApiResult } from "./client";
import type { ImportKind, ImportSummary } from "@/lib/portability/apply-import";
import type { ExportableDomain } from "@/lib/portability/backup";
import type { StoredScan, TrackedDomain } from "@/lib/storage/types";

export type DomainRow = TrackedDomain & {
  latest: { scannedAt: string; postureLabel: string } | null;
};

/** A full scan runs several network checks, so it gets longer than the default. */
export const SCAN_TIMEOUT_MS = 45000;

/** Everything the dashboard page needs, whichever place the data lives. */
export interface DashboardBackend {
  listDomains(): Promise<ApiResult<{ domains: DomainRow[] }>>;
  addDomain(hostname: string): Promise<ApiResult<{ domain: TrackedDomain }>>;
  scanDomain(domain: { id: string; hostname: string }): Promise<ApiResult<{ scan: StoredScan }>>;
  listScans(domainId: string): Promise<ApiResult<{ scans: StoredScan[] }>>;
  removeDomain(domainId: string): Promise<ApiResult<{ ok: boolean }>>;
  clearScans(domainId: string): Promise<ApiResult<Record<string, unknown>>>;

  /** Everything needed to build an export file. */
  exportData(): Promise<ApiResult<{ domains: ExportableDomain[] }>>;
  /** Reads and validates the text and reports what an import WOULD do. Writes nothing. */
  previewImport(text: string, kind: ImportKind): Promise<ApiResult<{ summary: ImportSummary }>>;
  /** Merges the import into what is stored. Never overwrites. */
  applyImport(text: string, kind: ImportKind): Promise<ApiResult<{ summary: ImportSummary }>>;
}

const JSON_HEADERS = { "Content-Type": "application/json" };
const BROWSER_ONLY = "Import and export are only available in browser mode.";

/** Server mode: every call goes to the /api/domains routes (SQLite on the server). */
export function createServerBackend(): DashboardBackend {
  const base = (id: string) => `/api/domains/${encodeURIComponent(id)}`;
  return {
    listDomains: () => requestJson<{ domains: DomainRow[] }>("/api/domains"),
    addDomain: (hostname) =>
      requestJson<{ domain: TrackedDomain }>("/api/domains", {
        method: "POST",
        headers: JSON_HEADERS,
        body: JSON.stringify({ hostname }),
      }),
    scanDomain: (domain) =>
      requestJson<{ scan: StoredScan }>(
        `${base(domain.id)}/scan`,
        { method: "POST" },
        SCAN_TIMEOUT_MS,
      ),
    listScans: (id) => requestJson<{ scans: StoredScan[] }>(`${base(id)}/scans`),
    removeDomain: (id) => requestJson<{ ok: boolean }>(base(id), { method: "DELETE" }),
    clearScans: (id) =>
      requestJson<Record<string, unknown>>(`${base(id)}/scans`, { method: "DELETE" }),

    exportData: async () => ({ ok: false, error: BROWSER_ONLY }),
    previewImport: async () => ({ ok: false, error: BROWSER_ONLY }),
    applyImport: async () => ({ ok: false, error: BROWSER_ONLY }),
  };
}