export interface ExportRow {
  hostname: string;
  addedAt: string;
  latestPosture: string | null;
  lastScannedAt: string | null;
}

/** One hostname per line. Re-importable by LinkGuard and most other tools. */
export function toPlainList(rows: ExportRow[]): string {
  return rows.map((row) => row.hostname).join("\n") + (rows.length > 0 ? "\n" : "");
}

/**
 * Spreadsheet programs run cells starting with = + - @ as formulas, so those
 * get a leading apostrophe. Fields with commas, quotes, or newlines are quoted.
 */
function csvCell(value: string): string {
  let cell = value;
  if (/^[=+\-@\t\r]/.test(cell)) cell = `'${cell}`;
  if (/[",\r\n]/.test(cell)) cell = `"${cell.replace(/"/g, '""')}"`;
  return cell;
}

export function toCsv(rows: ExportRow[]): string {
  const header = ["domain", "added_at", "latest_posture", "last_scanned_at"];
  const lines = rows.map((row) =>
    [row.hostname, row.addedAt, row.latestPosture ?? "", row.lastScannedAt ?? ""]
      .map(csvCell)
      .join(","),
  );
  return [header.join(","), ...lines].join("\r\n") + "\r\n";
}

export type ExportKind = "backup" | "domains-list" | "domains-csv";

const EXTENSIONS: Record<ExportKind, string> = {
  backup: "json",
  "domains-list": "txt",
  "domains-csv": "csv",
};

/** e.g. linkguard-backup-2026-10-16.json (the date is UTC). */
export function exportFilename(kind: ExportKind, now: Date = new Date()): string {
  const day = now.toISOString().slice(0, 10);
  const name = kind === "backup" ? "linkguard-backup" : kind.replace("domains-", "linkguard-domains-");
  return `${name}-${day}.${EXTENSIONS[kind]}`;
}