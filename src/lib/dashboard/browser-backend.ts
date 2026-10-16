import { SCAN_TIMEOUT_MS, type DashboardBackend } from "./backend";
import { requestJson, type ApiResult } from "./client";
import { MAX_DOMAINS, parseDomainInput } from "./parse-domain";
import { readImportText, runImport, type ImportKind, type ImportSummary } from "@/lib/portability/apply-import";
import type { ExportableDomain } from "@/lib/portability/backup";
import type { ScanReport } from "@/lib/scanner/types";
import type { ImportableStore } from "@/lib/storage/indexeddb-store";
import { MAX_SCANS_PER_DOMAIN, type ScanStore } from "@/lib/storage/types";

// NOT imported from "@/lib/storage": that file pulls in SQLite, which must
// never be bundled into browser code. Each browser only ever has one owner.
const BROWSER_OWNER_ID = "browser";

const STORAGE_ERROR =
  "Browser storage is not available. Private windows or blocked site data can cause this.";

async function guarded<T>(work: () => Promise<ApiResult<T>>): Promise<ApiResult<T>> {
  try {
    return await work();
  } catch {
    return { ok: false, error: STORAGE_ERROR };
  }
}

/** Anything coming back from the network is untrusted, even from our own server. */
function isUsableReport(value: unknown): value is ScanReport {
  if (typeof value !== "object" || value === null) return false;
  const posture = (value as { posture?: unknown }).posture;
  if (typeof posture !== "object" || posture === null) return false;
  return typeof (posture as { label?: unknown }).label === "string";
}

function canImport(store: ScanStore): store is ImportableStore {
  return typeof (store as Partial<ImportableStore>).importScan === "function";
}

/**
 * Browser mode: domains and history live in the given store (IndexedDB in
 * the real app). The server is used only to run a scan.
 */
export function createBrowserBackend(store: ScanStore): DashboardBackend {
  const owner = BROWSER_OWNER_ID;

  async function importFlow(
    text: string,
    kind: ImportKind,
    dryRun: boolean,
  ): Promise<ApiResult<{ summary: ImportSummary }>> {
    const read = readImportText(text, kind);
    if (!read.ok) return { ok: false, error: read.error };
    if (!canImport(store)) return { ok: false, error: STORAGE_ERROR };

    const target = store;
    return guarded(async () => {
      const summary = await runImport(target, owner, read.source, dryRun);
      return { ok: true, data: { summary } };
    });
  }

  return {
    listDomains: () =>
      guarded(async () => {
        const domains = await store.listDomains(owner);
        const rows = await Promise.all(
          domains.map(async (domain) => {
            const [latest] = await store.listScans(owner, domain.id, 1);
            return {
              ...domain,
              latest: latest
                ? { scannedAt: latest.scannedAt, postureLabel: latest.postureLabel }
                : null,
            };
          }),
        );
        return { ok: true, data: { domains: rows } };
      }),

    addDomain: (hostname) =>
      guarded(async () => {
        const parsed = parseDomainInput({ hostname });
        if (!parsed.ok) return { ok: false, error: parsed.error };

        const existing = await store.listDomains(owner);
        const alreadyTracked = existing.some((d) => d.hostname === parsed.hostname);
        if (!alreadyTracked && existing.length >= MAX_DOMAINS) {
          return { ok: false, error: `You can track at most ${MAX_DOMAINS} domains.` };
        }
        const domain = await store.addDomain(owner, parsed.hostname);
        return { ok: true, data: { domain } };
      }),

    async scanDomain(domain) {
      const result = await requestJson<{ report: unknown }>(
        "/api/scan",
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ url: domain.hostname }),
        },
        SCAN_TIMEOUT_MS,
      );
      if (!result.ok) return { ok: false, error: result.error };
      if (!isUsableReport(result.data.report)) {
        return { ok: false, error: "Unexpected response from the server." };
      }
      const report = result.data.report;

      return guarded(async () => {
        const scan = await store.saveScan(owner, domain.id, report);
        return { ok: true, data: { scan } };
      });
    },

    listScans: (domainId) =>
      guarded(async () => {
        const scans = await store.listScans(owner, domainId, MAX_SCANS_PER_DOMAIN);
        return { ok: true, data: { scans } };
      }),

    removeDomain: (domainId) =>
      guarded(async () => {
        const removed = await store.removeDomain(owner, domainId);
        return removed
          ? { ok: true, data: { ok: true } }
          : { ok: false, error: "Domain not found." };
      }),

    clearScans: (domainId) =>
      guarded(async () => {
        const deleted = await store.clearScans(owner, domainId);
        return { ok: true, data: { deleted } };
      }),

    exportData: () =>
      guarded(async () => {
        const domains = await store.listDomains(owner);
        const exportable: ExportableDomain[] = await Promise.all(
          domains.map(async (domain) => ({
            hostname: domain.hostname,
            createdAt: domain.createdAt,
            scans: await store.listScans(owner, domain.id, MAX_SCANS_PER_DOMAIN),
          })),
        );
        return { ok: true, data: { domains: exportable } };
      }),

    previewImport: (text, kind) => importFlow(text, kind, true),
    applyImport: (text, kind) => importFlow(text, kind, false),
  };
}