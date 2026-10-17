import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  createSqliteThreatIndex,
  openThreatDatabase,
  openThreatDatabaseReadOnly,
  sealThreatDatabase,
} from "./sqlite-threat-index";

let dir: string;
let dbPath: string;

beforeEach(async () => {
  dir = mkdtempSync(join(tmpdir(), "linkguard-threat-"));
  dbPath = join(dir, "threat-index.db");

  // Build it the way a deployment does: write normally, then seal.
  const db = openThreatDatabase(dbPath);
  await createSqliteThreatIndex(db).replaceSource(
    "test-feed",
    ["bad.example", "worse.example"],
    "2026-01-01T00:00:00.000Z",
  );
  sealThreatDatabase(db);
  db.close();
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

describe("sealed, read-only threat database", () => {
  it("leaves a single self-contained file", () => {
    expect(readdirSync(dir)).toEqual(["threat-index.db"]);
  });

  it("is no longer in WAL mode", () => {
    const db = openThreatDatabaseReadOnly(dbPath);
    expect(db.pragma("journal_mode", { simple: true })).toBe("delete");
    db.close();
  });

  it("answers lookups and status through a read-only connection", async () => {
    const db = openThreatDatabaseReadOnly(dbPath);
    const index = createSqliteThreatIndex(db);

    const matches = await index.lookup("bad.example");
    expect(matches).toContainEqual({
      source: "test-feed",
      matchedHost: "bad.example",
    });
    expect(await index.lookup("fine.example")).toEqual([]);
    expect(await index.getStatus()).toEqual([
      {
        source: "test-feed",
        updatedAt: "2026-01-01T00:00:00.000Z",
        entryCount: 2,
      },
    ]);
    db.close();
  });

  it("refuses to write", () => {
    const db = openThreatDatabaseReadOnly(dbPath);
    expect(() =>
      db
        .prepare("INSERT INTO threat_hosts (host, source) VALUES ('x.example', 't')")
        .run(),
    ).toThrow();
    db.close();
  });

  it("creates no side files while reading", async () => {
    const db = openThreatDatabaseReadOnly(dbPath);
    await createSqliteThreatIndex(db).lookup("bad.example");
    db.close();
    expect(readdirSync(dir)).toEqual(["threat-index.db"]);
  });

  it("fails on a missing file instead of creating an empty one", () => {
    const missing = join(dir, "missing.db");
    expect(() => openThreatDatabaseReadOnly(missing)).toThrow();
    expect(readdirSync(dir)).not.toContain("missing.db");
  });
});