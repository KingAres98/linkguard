import { beforeEach, describe, expect, it } from "vitest";
import { refreshSource, type ThreatSource } from "./refresh";
import { createSqliteThreatIndex, openThreatDatabase } from "./sqlite-threat-index";
import type { ThreatIndex } from "./types";

const SOURCE: ThreatSource = {
  id: "test-feed",
  name: "Test feed",
  url: "https://lists.example/feed.txt",
  minEntries: 3,
};
const NOW = () => new Date("2026-10-07T12:00:00.000Z");

let index: ThreatIndex;

beforeEach(() => {
  index = createSqliteThreatIndex(openThreatDatabase(":memory:"));
});

const listOf =
  (...hosts: string[]) =>
  async () =>
    hosts.join("\n");

describe("refreshSource", () => {
  it("stores the parsed hosts and reports counts", async () => {
    const result = await refreshSource(
      index,
      SOURCE,
      listOf("a.com", "b.com", "c.com", "not a host"),
      NOW,
    );
    expect(result).toEqual({ ok: true, source: "test-feed", count: 3, skipped: 1 });
    expect(await index.lookup("b.com")).toHaveLength(1);
    expect((await index.getStatus())[0].updatedAt).toBe("2026-10-07T12:00:00.000Z");
  });

  it("keeps the old data when the download fails", async () => {
    await refreshSource(index, SOURCE, listOf("a.com", "b.com", "c.com"), NOW);
    const result = await refreshSource(
      index,
      SOURCE,
      async () => {
        throw new Error("Download failed with HTTP 503.");
      },
      NOW,
    );
    expect(result).toEqual({
      ok: false,
      source: "test-feed",
      error: "Download failed with HTTP 503.",
    });
    expect(await index.lookup("a.com")).toHaveLength(1);
  });

  it("keeps the old data when the list has too few usable entries", async () => {
    await refreshSource(index, SOURCE, listOf("a.com", "b.com", "c.com"), NOW);
    const result = await refreshSource(index, SOURCE, listOf("only.com"), NOW);
    expect(result.ok).toBe(false);
    expect(await index.lookup("a.com")).toHaveLength(1);
    expect(await index.lookup("only.com")).toHaveLength(0);
  });

  it("keeps the old data when the list suddenly shrinks by more than half", async () => {
    const big = Array.from({ length: 10 }, (_, i) => `host${i}.example.com`);
    await refreshSource(index, SOURCE, listOf(...big), NOW);

    const result = await refreshSource(
      index,
      SOURCE,
      listOf("x1.com", "x2.com", "x3.com", "x4.com"), // 4 is under half of 10
      NOW,
    );
    expect(result.ok).toBe(false);
    expect(await index.lookup("host0.example.com")).toHaveLength(1);
  });

  it("replaces the previous entries on a normal update", async () => {
    await refreshSource(index, SOURCE, listOf("old.com", "keep.com", "keep2.com"), NOW);
    const result = await refreshSource(index, SOURCE, listOf("new.com", "keep.com", "keep2.com"), NOW);
    expect(result.ok).toBe(true);
    expect(await index.lookup("old.com")).toHaveLength(0);
    expect(await index.lookup("new.com")).toHaveLength(1);
  });
});