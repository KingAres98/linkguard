import { mkdtempSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getThreatIndex,
  setThreatIndexForTesting,
  shouldOpenReadOnly,
} from "./index";
import {
  createSqliteThreatIndex,
  openThreatDatabase,
  sealThreatDatabase,
} from "./sqlite-threat-index";

describe("shouldOpenReadOnly", () => {
  it("is off when nothing is set", () => {
    expect(shouldOpenReadOnly({})).toBe(false);
  });

  it("turns on when forced", () => {
    expect(shouldOpenReadOnly({ LINKGUARD_THREAT_DB_READONLY: "true" })).toBe(true);
  });

  it("turns on automatically on Vercel", () => {
    expect(shouldOpenReadOnly({ VERCEL: "1" })).toBe(true);
  });

  it("lets an explicit false win over Vercel detection", () => {
    expect(
      shouldOpenReadOnly({ VERCEL: "1", LINKGUARD_THREAT_DB_READONLY: "false" }),
    ).toBe(false);
  });

  it("ignores an empty VERCEL value", () => {
    expect(shouldOpenReadOnly({ VERCEL: "" })).toBe(false);
  });
});

describe("getThreatIndex", () => {
  let dir: string;
  let sealedPath: string;

  beforeEach(async () => {
    setThreatIndexForTesting(undefined);
    dir = mkdtempSync(join(tmpdir(), "linkguard-index-"));
    sealedPath = join(dir, "sealed.db");

    // Build it the way a deployment does: write normally, then seal.
    const db = openThreatDatabase(sealedPath);
    await createSqliteThreatIndex(db).replaceSource(
      "test-feed",
      ["bad.example"],
      "2026-01-01T00:00:00.000Z",
    );
    sealThreatDatabase(db);
    db.close();
  });

  afterEach(() => {
    setThreatIndexForTesting(undefined);
    vi.unstubAllEnvs();
    try {
      rmSync(dir, { recursive: true, force: true });
    } catch {
      // Windows keeps a file locked while a connection to it is open. The
      // folder is in the system temp area, so leaving it behind is harmless.
    }
  });

  it("reads the sealed database when read-only mode is on", async () => {
    vi.stubEnv("LINKGUARD_THREAT_DB_READONLY", "true");
    vi.stubEnv("LINKGUARD_THREAT_DB_PATH", sealedPath);

    const matches = await getThreatIndex().lookup("bad.example");
    expect(matches).toContainEqual({
      source: "test-feed",
      matchedHost: "bad.example",
    });
  });

  it("fails on a missing database in read-only mode instead of creating one", () => {
    vi.stubEnv("LINKGUARD_THREAT_DB_READONLY", "true");
    vi.stubEnv("LINKGUARD_THREAT_DB_PATH", join(dir, "missing.db"));

    expect(() => getThreatIndex()).toThrow();
    expect(readdirSync(dir)).not.toContain("missing.db");
  });

  it("does not remember a failed open", async () => {
    vi.stubEnv("LINKGUARD_THREAT_DB_READONLY", "true");
    vi.stubEnv("LINKGUARD_THREAT_DB_PATH", join(dir, "missing.db"));
    expect(() => getThreatIndex()).toThrow();

    vi.stubEnv("LINKGUARD_THREAT_DB_PATH", sealedPath);
    const matches = await getThreatIndex().lookup("bad.example");
    expect(matches).toContainEqual({
      source: "test-feed",
      matchedHost: "bad.example",
    });
  });

  it("still creates the database in normal read/write mode", () => {
    vi.stubEnv("LINKGUARD_THREAT_DB_READONLY", "false");
    vi.stubEnv("LINKGUARD_THREAT_DB_PATH", join(dir, "created.db"));

    getThreatIndex();
    expect(readdirSync(dir)).toContain("created.db");
  });
});