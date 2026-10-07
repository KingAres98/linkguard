import { beforeEach, describe, expect, it } from "vitest";
import { createSqliteThreatIndex, openThreatDatabase } from "./sqlite-threat-index";
import type { ThreatIndex } from "./types";

const T = "2026-10-07T12:00:00.000Z";
let index: ThreatIndex;

beforeEach(() => {
  index = createSqliteThreatIndex(openThreatDatabase(":memory:"));
});

describe("SQLite threat index", () => {
  it("finds an exact match and reports its source", async () => {
    await index.replaceSource("feed-a", ["evil.com"], T);
    expect(await index.lookup("evil.com")).toEqual([{ source: "feed-a", matchedHost: "evil.com" }]);
  });

  it("matches a subdomain of a listed domain", async () => {
    await index.replaceSource("feed-a", ["evil.com"], T);
    expect(await index.lookup("login.evil.com")).toEqual([
      { source: "feed-a", matchedHost: "evil.com" },
    ]);
  });

  it("does not match siblings, parents, or lookalikes", async () => {
    await index.replaceSource("feed-a", ["bad.example.com", "evil.com"], T);
    for (const host of [
      "example.com",
      "good.example.com",
      "notevil.com",
      "evil.com.attacker.org",
      "evil.co",
    ]) {
      expect(await index.lookup(host)).toEqual([]);
    }
  });

  it("is case-insensitive", async () => {
    await index.replaceSource("feed-a", ["evil.com"], T);
    expect(await index.lookup("LOGIN.Evil.COM")).toHaveLength(1);
  });

  it("reports one match per source that lists the host", async () => {
    await index.replaceSource("feed-a", ["evil.com"], T);
    await index.replaceSource("feed-b", ["evil.com"], T);
    const sources = (await index.lookup("evil.com")).map((m) => m.source).sort();
    expect(sources).toEqual(["feed-a", "feed-b"]);
  });

  it("replaces only the named source's entries", async () => {
    await index.replaceSource("feed-a", ["old.com"], T);
    await index.replaceSource("feed-b", ["keep.com"], T);
    await index.replaceSource("feed-a", ["new.com"], T);

    expect(await index.lookup("old.com")).toEqual([]);
    expect(await index.lookup("new.com")).toHaveLength(1);
    expect(await index.lookup("keep.com")).toHaveLength(1);
  });

  it("reports status with counts and timestamps", async () => {
    await index.replaceSource("feed-a", ["one.com", "two.com"], T);
    expect(await index.getStatus()).toEqual([
      { source: "feed-a", updatedAt: T, entryCount: 2 },
    ]);
  });

  it("returns no matches for an IP address", async () => {
    await index.replaceSource("feed-a", ["evil.com"], T);
    expect(await index.lookup("203.0.113.9")).toEqual([]);
  });
});