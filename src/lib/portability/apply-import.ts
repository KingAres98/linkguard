import { MAX_DOMAINS } from "@/lib/dashboard/parse-domain";
import type { ImportableStore } from "@/lib/storage/indexeddb-store";
import { parseBackup, type BackupFile, type BackupScan } from "./backup";
import { parseDomainList } from "./domain-list";

export type ImportKind = "backup" | "list";

export type ImportSource =
  | { kind: "backup"; backup: BackupFile }
  | { kind: "list"; domains: string[]; skipped: number; truncated: boolean };

export interface ImportSummary {
  domainsAdded: number;
  domainsAlreadyTracked: number;
  /** New domains that did not fit under the domain limit. */
  domainsOverLimit: number;
  scansImported: number;
  /** Imported scans left out because that domain already has history here. */
  scansSkipped: number;
  /** Lines or entries in a list file that held no usable domain. */
  linesSkipped: number;
  /** True if a list file had more domains than we read. */
  truncated: boolean;
}

export type ReadImportResult =
  | { ok: true; source: ImportSource }
  | { ok: false; error: string };

/** Validates the text as the chosen kind of file. Nothing is written. */
export function readImportText(text: string, kind: ImportKind): ReadImportResult {
  if (kind === "backup") {
    const result = parseBackup(text);
    if (!result.ok) return result;
    return { ok: true, source: { kind: "backup", backup: result.backup } };
  }
  const result = parseDomainList(text);
  if (!result.ok) return result;
  return {
    ok: true,
    source: {
      kind: "list",
      domains: result.domains,
      skipped: result.skipped,
      truncated: result.truncated,
    },
  };
}

export interface DomainImportPlan {
  toAdd: string[];
  alreadyTracked: string[];
  overLimit: string[];
}

/** Pure: decides which incoming domains are added, already tracked, or over the limit. */
export function planDomainImport(
  existing: string[],
  incoming: string[],
  max: number = MAX_DOMAINS,
): DomainImportPlan {
  const known = new Set(existing);
  const seen = new Set<string>();
  const plan: DomainImportPlan = { toAdd: [], alreadyTracked: [], overLimit: [] };
  let room = Math.max(0, max - existing.length);

  for (const host of incoming) {
    if (seen.has(host)) continue;
    seen.add(host);
    if (known.has(host)) {
      plan.alreadyTracked.push(host);
    } else if (room > 0) {
      plan.toAdd.push(host);
      room--;
    } else {
      plan.overLimit.push(host);
    }
  }
  return plan;
}

/**
 * Merges an import into the store without ever overwriting. With dryRun the
 * exact same decisions are made and counted, but nothing is written, which is
 * what the preview shows.
 */
export async function runImport(
  store: ImportableStore,
  owner: string,
  source: ImportSource,
  dryRun: boolean,
): Promise<ImportSummary> {
  const existing = await store.listDomains(owner);
  const idByHost = new Map(existing.map((d) => [d.hostname, d.id]));

  const scansByHost = new Map<string, BackupScan[]>();
  let incoming: string[];
  if (source.kind === "backup") {
    incoming = source.backup.domains.map((d) => d.hostname);
    for (const domain of source.backup.domains) scansByHost.set(domain.hostname, domain.scans);
  } else {
    incoming = source.domains;
  }

  const plan = planDomainImport(
    existing.map((d) => d.hostname),
    incoming,
  );

  const summary: ImportSummary = {
    domainsAdded: plan.toAdd.length,
    domainsAlreadyTracked: plan.alreadyTracked.length,
    domainsOverLimit: plan.overLimit.length,
    scansImported: 0,
    scansSkipped: 0,
    linesSkipped: source.kind === "list" ? source.skipped : 0,
    truncated: source.kind === "list" ? source.truncated : false,
  };

  for (const host of plan.toAdd) {
    const scans = scansByHost.get(host) ?? [];
    summary.scansImported += scans.length;
    if (dryRun) continue;
    const domain = await store.addDomain(owner, host);
    for (const scan of scans) await store.importScan(owner, domain.id, scan);
  }

  for (const host of plan.alreadyTracked) {
    const scans = scansByHost.get(host) ?? [];
    const id = idByHost.get(host);
    if (scans.length === 0 || id === undefined) continue;

    const hasHistory = (await store.listScans(owner, id, 1)).length > 0;
    if (hasHistory) {
      summary.scansSkipped += scans.length;
      continue;
    }
    summary.scansImported += scans.length;
    if (dryRun) continue;
    for (const scan of scans) await store.importScan(owner, id, scan);
  }

  return summary;
}