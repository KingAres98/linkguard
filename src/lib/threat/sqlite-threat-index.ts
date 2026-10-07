import Database from "better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { candidateHosts } from "./match";
import type { SourceStatus, ThreatIndex, ThreatMatch } from "./types";

export function defaultThreatDbPath(): string {
  return process.env.LINKGUARD_THREAT_DB_PATH ?? "data/threat-index.db";
}

/** Opens (and creates, if needed) the threat database, or ":memory:" for tests. */
export function openThreatDatabase(path: string): Database.Database {
  if (path !== ":memory:") {
    mkdirSync(dirname(path), { recursive: true });
  }
  const db = new Database(path);
  // WAL mode lets the web server read while the update script writes.
  db.pragma("journal_mode = WAL");
  db.exec(`
    CREATE TABLE IF NOT EXISTS threat_hosts (
      host    TEXT NOT NULL,
      source  TEXT NOT NULL,
      PRIMARY KEY (host, source)
    ) WITHOUT ROWID;

    CREATE TABLE IF NOT EXISTS threat_sources (
      source       TEXT PRIMARY KEY,
      updated_at   TEXT NOT NULL,
      entry_count  INTEGER NOT NULL
    );
  `);
  return db;
}

export function createSqliteThreatIndex(db: Database.Database): ThreatIndex {
  // Every value goes through a ? placeholder.
  const selectMatches = db.prepare("SELECT host, source FROM threat_hosts WHERE host = ?");
  const insertHost = db.prepare("INSERT OR IGNORE INTO threat_hosts (host, source) VALUES (?, ?)");
  const deleteSource = db.prepare("DELETE FROM threat_hosts WHERE source = ?");
  const upsertSource = db.prepare(
    "INSERT INTO threat_sources (source, updated_at, entry_count) VALUES (?, ?, ?) ON CONFLICT (source) DO UPDATE SET updated_at = excluded.updated_at, entry_count = excluded.entry_count",
  );
  const selectStatus = db.prepare(
    "SELECT source, updated_at, entry_count FROM threat_sources ORDER BY source",
  );

  // One transaction: the old entries are replaced completely, or not at all.
  const replace = db.transaction((source: string, hosts: readonly string[], updatedAt: string) => {
    deleteSource.run(source);
    for (const host of hosts) insertHost.run(host, source);
    upsertSource.run(source, updatedAt, hosts.length);
  });

  return {
    async lookup(hostname) {
      const matches: ThreatMatch[] = [];
      for (const host of candidateHosts(hostname)) {
        for (const row of selectMatches.all(host) as { host: string; source: string }[]) {
          matches.push({ source: row.source, matchedHost: row.host });
        }
      }
      return matches;
    },

    async getStatus() {
      return (
        selectStatus.all() as { source: string; updated_at: string; entry_count: number }[]
      ).map(
        (row): SourceStatus => ({
          source: row.source,
          updatedAt: row.updated_at,
          entryCount: row.entry_count,
        }),
      );
    },

    async replaceSource(source, hosts, updatedAt) {
      replace(source, hosts, updatedAt);
    },
  };
}