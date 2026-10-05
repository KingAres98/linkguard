import Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import type { ScanReport } from "@/lib/scanner/types";
import type { ScanStore, StoredScan, TrackedDomain } from "./types";

const DEFAULT_SCAN_LIMIT = 50;

interface DomainRow {
  id: string;
  owner_id: string;
  hostname: string;
  created_at: string;
}

interface ScanRow {
  id: string;
  domain_id: string;
  scanned_at: string;
  posture_label: string;
  report_json: string;
}

/** Plain, portable SQL so a Postgres or D1 version stays close to this. */
function initSchema(db: Database.Database): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS domains (
      id          TEXT PRIMARY KEY,
      owner_id    TEXT NOT NULL,
      hostname    TEXT NOT NULL,
      created_at  TEXT NOT NULL,
      UNIQUE (owner_id, hostname)
    );

    CREATE TABLE IF NOT EXISTS scans (
      seq            INTEGER PRIMARY KEY AUTOINCREMENT,
      id             TEXT NOT NULL UNIQUE,
      domain_id      TEXT NOT NULL REFERENCES domains(id) ON DELETE CASCADE,
      scanned_at     TEXT NOT NULL,
      posture_label  TEXT NOT NULL,
      report_json    TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_scans_domain ON scans(domain_id, seq);
  `);
}

/** Opens (and creates, if needed) a database file, or ":memory:" for tests. */
export function openDatabase(path: string): Database.Database {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  // SQLite does NOT enforce foreign keys (including ON DELETE CASCADE)
  // unless this is turned on for every connection.
  db.pragma("foreign_keys = ON");
  initSchema(db);
  return db;
}

function toDomain(row: DomainRow): TrackedDomain {
  return {
    id: row.id,
    ownerId: row.owner_id,
    hostname: row.hostname,
    createdAt: row.created_at,
  };
}

function toScan(row: ScanRow): StoredScan {
  return {
    id: row.id,
    domainId: row.domain_id,
    scannedAt: row.scanned_at,
    postureLabel: row.posture_label,
    report: JSON.parse(row.report_json) as ScanReport,
  };
}

export function createSqliteStore(db: Database.Database): ScanStore {
  // Prepared once, reused. Every value goes through a ? placeholder.
  const insertDomain = db.prepare(
    "INSERT INTO domains (id, owner_id, hostname, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (owner_id, hostname) DO NOTHING",
  );
  const selectDomainByHostname = db.prepare(
    "SELECT * FROM domains WHERE owner_id = ? AND hostname = ?",
  );
  const selectDomainsByOwner = db.prepare(
    "SELECT * FROM domains WHERE owner_id = ? ORDER BY created_at, id",
  );
  const selectDomainById = db.prepare("SELECT * FROM domains WHERE id = ? AND owner_id = ?");
  const deleteDomain = db.prepare("DELETE FROM domains WHERE id = ? AND owner_id = ?");
  const insertScan = db.prepare(
    "INSERT INTO scans (id, domain_id, scanned_at, posture_label, report_json) VALUES (?, ?, ?, ?, ?)",
  );
  const selectScans = db.prepare(
    "SELECT * FROM scans WHERE domain_id = ? ORDER BY seq DESC LIMIT ?",
  );

  function findDomain(ownerId: string, domainId: string): DomainRow | undefined {
    return selectDomainById.get(domainId, ownerId) as DomainRow | undefined;
  }

  return {
    async addDomain(ownerId, hostname) {
      insertDomain.run(randomUUID(), ownerId, hostname, new Date().toISOString());
      // If the hostname already existed, the insert was skipped and we
      // return the original row.
      return toDomain(selectDomainByHostname.get(ownerId, hostname) as DomainRow);
    },

    async listDomains(ownerId) {
      return (selectDomainsByOwner.all(ownerId) as DomainRow[]).map(toDomain);
    },

    async getDomain(ownerId, domainId) {
      const row = findDomain(ownerId, domainId);
      return row ? toDomain(row) : null;
    },

    async removeDomain(ownerId, domainId) {
      return deleteDomain.run(domainId, ownerId).changes > 0;
    },

    async saveScan(ownerId, domainId, report) {
      // Ownership check first: a scan can only be saved under a domain
      // that belongs to this owner.
      if (!findDomain(ownerId, domainId)) {
        throw new Error("Domain not found");
      }
      const id = randomUUID();
      insertScan.run(id, domainId, report.scannedAt, report.posture.label, JSON.stringify(report));
      return {
        id,
        domainId,
        scannedAt: report.scannedAt,
        postureLabel: report.posture.label,
        report,
      };
    },

    async listScans(ownerId, domainId, limit = DEFAULT_SCAN_LIMIT) {
      if (!findDomain(ownerId, domainId)) return [];
      return (selectScans.all(domainId, limit) as ScanRow[]).map(toScan);
    },
  };
}