import { describe, expect, it } from "vitest";
import { refreshSource, resolveSource, THREAT_SOURCES, type ThreatSource } from "./refresh";
import { createSqliteThreatIndex, openThreatDatabase } from "./sqlite-threat-index";

describe("resolveSource", () => {
  it("uses a fixed URL as given", () => {
    const source = resolveSource(
      { id: "a", name: "A", url: "https://lists.example/a.txt", minEntries: 1 },
      {},
    );
    expect(source?.url).toBe("https://lists.example/a.txt");
  });

  it("reads the URL from the named environment variable, trimmed", () => {
    const source = resolveSource(
      { id: "a", name: "A", urlEnvVar: "FEED_URL", minEntries: 1 },
      { FEED_URL: "  https://lists.example/key/a.txt  " },
    );
    expect(source?.url).toBe("https://lists.example/key/a.txt");
  });

  it("returns null when the variable is missing or empty", () => {
    const definition = { id: "a", name: "A", urlEnvVar: "FEED_URL", minEntries: 1 };
    expect(resolveSource(definition, {})).toBeNull();
    expect(resolveSource(definition, { FEED_URL: "   " })).toBeNull();
  });

  it("returns null for URLs that are not https or not URLs at all", () => {
    const definition = { id: "a", name: "A", urlEnvVar: "FEED_URL", minEntries: 1 };
    expect(resolveSource(definition, { FEED_URL: "http://lists.example/a.txt" })).toBeNull();
    expect(resolveSource(definition, { FEED_URL: "not a url" })).toBeNull();
  });
});

describe("THREAT_SOURCES", () => {
  it("has unique ids, and exactly one URL setting per source", () => {
    const ids = THREAT_SOURCES.map((s) => s.id);
    expect(new Set(ids).size).toBe(ids.length);
    for (const source of THREAT_SOURCES) {
      expect(Boolean(source.url) !== Boolean(source.urlEnvVar)).toBe(true);
    }
  });
});

describe("refreshSource secrecy", () => {
  it("does not repeat a secret download URL in error messages", async () => {
    const source: ThreatSource = {
      id: "s",
      name: "S",
      url: "https://lists.example/SECRETKEY/hosts.txt",
      minEntries: 1,
    };
    const index = createSqliteThreatIndex(openThreatDatabase(":memory:"));
    const result = await refreshSource(index, source, async (url) => {
      throw new Error(`request to ${url} failed`);
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toContain("SECRETKEY");
  });
});