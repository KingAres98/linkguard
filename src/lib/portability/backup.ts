import { MAX_DOMAINS, parseDomainInput } from "@/lib/dashboard/parse-domain";
import {
  CATEGORIES,
  CONFIDENCES,
  SEVERITIES,
  STATUSES,
  type ScanReport,
} from "@/lib/scanner/types";
import { MAX_SCANS_PER_DOMAIN, type StoredScan } from "@/lib/storage/types";

export const BACKUP_FORMAT = "linkguard-backup";
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 5 * 1024 * 1024;

const MAX_FINDINGS = 200;
const MAX_EVIDENCE_ITEMS = 50;
const MAX_TEXT_LENGTH = 5000;

export interface BackupScan {
  scannedAt: string;
  report: ScanReport;
}

export interface BackupDomain {
  hostname: string;
  addedAt: string;
  scans: BackupScan[]; // oldest first
}

export interface BackupFile {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  domains: BackupDomain[];
}

/** What the export needs for one domain. Local IDs are deliberately not included. */
export interface ExportableDomain {
  hostname: string;
  createdAt: string;
  scans: StoredScan[];
}

export function createBackup(domains: ExportableDomain[], now: Date = new Date()): BackupFile {
  return {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    domains: domains.map((domain) => ({
      hostname: domain.hostname,
      addedAt: domain.createdAt,
      scans: [...domain.scans]
        .sort((a, b) => a.scannedAt.localeCompare(b.scannedAt))
        .map((scan) => ({ scannedAt: scan.scannedAt, report: scan.report })),
    })),
  };
}

export function serializeBackup(backup: BackupFile): string {
  return JSON.stringify(backup, null, 2);
}

export type ParseBackupResult =
  | { ok: true; backup: BackupFile }
  | { ok: false; error: string };

function fail(error: string): ParseBackupResult {
  return { ok: false, error };
}

function isObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown, max: number = MAX_TEXT_LENGTH): value is string {
  return typeof value === "string" && value.length <= max;
}

function isOneOf(list: readonly string[], value: unknown): boolean {
  return typeof value === "string" && list.includes(value);
}

const ISO_PATTERN = /^\d{4}-\d{2}-\d{2}T[\d:.]+(Z|[+-]\d{2}:\d{2})$/;

function isIsoDate(value: unknown): value is string {
  return (
    typeof value === "string" &&
    value.length <= 40 &&
    ISO_PATTERN.test(value) &&
    !Number.isNaN(Date.parse(value))
  );
}

function isValidFinding(value: unknown): boolean {
  if (!isObject(value)) return false;
  if (!isText(value.id, 200) || !isText(value.title, 500)) return false;
  if (!isText(value.description) || !isText(value.whyItMatters)) return false;
  if (!isText(value.recommendation)) return false;
  if (!(value.limitations === undefined || isText(value.limitations))) return false;
  if (!isOneOf(CATEGORIES, value.category)) return false;
  if (!isOneOf(STATUSES, value.status)) return false;
  if (!isOneOf(SEVERITIES, value.severity)) return false;
  if (!isOneOf(CONFIDENCES, value.confidence)) return false;

  const evidence = value.evidence;
  if (!Array.isArray(evidence) || evidence.length > MAX_EVIDENCE_ITEMS) return false;
  return evidence.every((item) => isObject(item) && isText(item.label) && isText(item.value));
}

function isValidReport(value: unknown): value is ScanReport {
  if (!isObject(value)) return false;
  if (!isText(value.target, 2048) || !isIsoDate(value.scannedAt)) return false;

  const findings = value.findings;
  if (!Array.isArray(findings) || findings.length > MAX_FINDINGS) return false;
  if (!findings.every(isValidFinding)) return false;

  const posture = value.posture;
  if (!isObject(posture) || !isText(posture.label, 100)) return false;
  return posture.drivenByFindingId === undefined || isText(posture.drivenByFindingId, 200);
}

/**
 * Strictly validates a backup file's text. Nothing is trusted: sizes, counts,
 * field types, dates, and every hostname are checked. Error messages are
 * fixed strings and never repeat anything from the file.
 */
export function parseBackup(text: string): ParseBackupResult {
  if (new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) {
    return fail("That backup file is too large to import (limit 5 MB).");
  }

  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return fail("That file is not valid JSON, so it cannot be a LinkGuard backup.");
  }

  if (!isObject(data) || data.format !== BACKUP_FORMAT) {
    return fail("That file is not a LinkGuard backup.");
  }
  if (typeof data.version !== "number" || !Number.isInteger(data.version) || data.version < 1) {
    return fail("That backup has an invalid version.");
  }
  if (data.version > BACKUP_VERSION) {
    return fail("That backup was made by a newer version of LinkGuard. Update LinkGuard and try again.");
  }
  if (!isIsoDate(data.exportedAt)) {
    return fail("That backup has an invalid export date.");
  }
  if (!Array.isArray(data.domains)) {
    return fail("That backup has no domain list.");
  }
  if (data.domains.length > MAX_DOMAINS) {
    return fail(`That backup has more than ${MAX_DOMAINS} domains, which is the limit.`);
  }

  const seen = new Set<string>();
  const domains: BackupDomain[] = [];

  for (let i = 0; i < data.domains.length; i++) {
    const entry: unknown = data.domains[i];
    const label = `Domain ${i + 1} in this backup`;

    if (!isObject(entry)) return fail(`${label} is not valid.`);
    const parsed = parseDomainInput({ hostname: entry.hostname });
    if (!parsed.ok) return fail(`${label} has an invalid domain name.`);
    if (seen.has(parsed.hostname)) return fail(`${label} appears more than once.`);
    seen.add(parsed.hostname);

    if (!isIsoDate(entry.addedAt)) return fail(`${label} has an invalid date.`);
    if (!Array.isArray(entry.scans)) return fail(`${label} has no scan list.`);
    if (entry.scans.length > MAX_SCANS_PER_DOMAIN) {
      return fail(`${label} has more than ${MAX_SCANS_PER_DOMAIN} saved scans, which is the limit.`);
    }

    const scans: BackupScan[] = [];
    for (let j = 0; j < entry.scans.length; j++) {
      const scan: unknown = entry.scans[j];
      if (!isObject(scan) || !isIsoDate(scan.scannedAt) || !isValidReport(scan.report)) {
        return fail(`Scan ${j + 1} of domain ${i + 1} in this backup is not valid.`);
      }
      scans.push({ scannedAt: scan.scannedAt, report: scan.report });
    }
    scans.sort((a, b) => a.scannedAt.localeCompare(b.scannedAt));

    domains.push({ hostname: parsed.hostname, addedAt: entry.addedAt, scans });
  }

  return {
    ok: true,
    backup: {
      format: BACKUP_FORMAT,
      version: data.version,
      exportedAt: data.exportedAt,
      domains,
    },
  };
}