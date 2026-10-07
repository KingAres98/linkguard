import { beforeEach, describe, expect, it } from "vitest";
import { createSqliteThreatIndex, openThreatDatabase } from "@/lib/threat/sqlite-threat-index";
import type { ThreatIndex } from "@/lib/threat/types";
import { checkThreatIntel, hostnamesFromUrls } from "./threat-checker";

const NOW = () => new Date("2026-10-07T12:00:00.000Z");
const FRESH = "2026-10-06T12:00:00.000Z";
const STALE = "2026-09-01T00:00:00.000Z";
const FEED = "phishing-database";

let index: ThreatIndex;
const check = (hosts: string[]) => checkThreatIntel(() => index, hosts, NOW);

beforeEach(() => {
  index = createSqliteThreatIndex(openThreatDatabase(":memory:"));
});

describe("checkThreatIntel", () => {
  it("reports a listed hostname as a critical failure with its evidence", async () => {
    await index.replaceSource(FEED, ["evil.com"], FRESH);
    const findings = await check(["evil.com"]);
    expect(findings).toHaveLength(1);
    expect(findings[0]).toMatchObject({
      id: "threat.listed",
      category: "threat",
      status: "fail",
      severity: "critical",
    });
    expect(findings[0].description).toContain("evil.com");
    expect(findings[0].evidence.some((e) => e.value.includes("Phishing.Database"))).toBe(true);
  });

  it("explains when the match was a parent domain", async () => {
    await index.replaceSource(FEED, ["evil.com"], FRESH);
    const [finding] = await check(["login.evil.com"]);
    expect(finding.id).toBe("threat.listed");
    expect(finding.limitations).toContain("parent domain");
  });

  it("catches a listed redirect destination", async () => {
    await index.replaceSource(FEED, ["evil.com"], FRESH);
    const [finding] = await check(["clean.example.org", "evil.com"]);
    expect(finding.id).toBe("threat.listed");
    expect(finding.description).toContain("redirects to");
    expect(finding.description).toContain("evil.com");
  });

  it("raises confidence when two feeds list the same host", async () => {
    await index.replaceSource(FEED, ["evil.com"], FRESH);
    await index.replaceSource("other-feed", ["evil.com"], FRESH);
    const [finding] = await check(["evil.com"]);
    expect(finding.confidence).toBe("high");
  });

  it("keeps evidence labels unique, because the UI uses them as list keys", async () => {
    await index.replaceSource(FEED, ["evil.com"], FRESH);
    await index.replaceSource("other-feed", ["evil.com"], FRESH);
    const [finding] = await check(["evil.com", "login.evil.com"]);
    const labels = finding.evidence.map((e) => e.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

  it("reports 'not found' as neutral information, never as a pass", async () => {
    await index.replaceSource(FEED, ["evil.com"], FRESH);
    const [finding] = await check(["example.com"]);
    expect(finding).toMatchObject({
      id: "threat.not-listed",
      status: "info",
      severity: "info",
    });
    expect(finding.limitations).toContain("does not mean");
  });

  it("never describes any result with safety words", async () => {
    await index.replaceSource(FEED, ["evil.com"], FRESH);
    const listed = await check(["evil.com"]);
    const notListed = await check(["example.com"]);
    const unavailable = await checkThreatIntel(
      () => {
        throw new Error("boom");
      },
      ["example.com"],
      NOW,
    );
    for (const finding of [...listed, ...notListed, ...unavailable]) {
      expect(`${finding.title} ${finding.description}`).not.toMatch(
        /\bsafe\b|\bclean\b|\btrusted\b|\bverified\b/i,
      );
    }
  });

  it("says 'could not check' when no feed data exists", async () => {
    const [finding] = await check(["example.com"]);
    expect(finding).toMatchObject({ id: "threat.unavailable", status: "unknown" });
  });

  it("says 'could not check' when feed data is stale, but still reports a listing", async () => {
    await index.replaceSource(FEED, ["evil.com"], STALE);
    const [notChecked] = await check(["example.com"]);
    expect(notChecked.id).toBe("threat.unavailable");
    const [listed] = await check(["evil.com"]);
    expect(listed.id).toBe("threat.listed");
  });

  it("says 'could not check' when the database fails, without leaking the error", async () => {
    const [finding] = await checkThreatIntel(
      () => {
        throw new Error("boom: /secret/path/threat.db");
      },
      ["example.com"],
      NOW,
    );
    expect(finding.id).toBe("threat.unavailable");
    expect(JSON.stringify(finding)).not.toContain("secret");
  });

  it("skips IP-address targets entirely", async () => {
    await index.replaceSource(FEED, ["evil.com"], FRESH);
    expect(await check(["203.0.113.9"])).toEqual([]);
  });
});

describe("hostnamesFromUrls", () => {
  it("puts the entered host first, then redirect hosts, without duplicates or junk", () => {
    expect(
      hostnamesFromUrls("Example.com", [
        "https://example.com/",
        "https://www.example.com/a",
        "not a url",
        "https://[::1]/",
      ]),
    ).toEqual(["example.com", "www.example.com"]);
  });
});