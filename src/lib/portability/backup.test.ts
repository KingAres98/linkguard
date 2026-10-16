import { describe, expect, it } from "vitest";
import {
  BACKUP_FORMAT,
  MAX_BACKUP_BYTES,
  createBackup,
  parseBackup,
  serializeBackup,
  type ExportableDomain,
} from "./backup";
import type { ScanReport } from "@/lib/scanner/types";
import type { StoredScan } from "@/lib/storage/types";

function makeReport(): ScanReport {
  return {
    target: "https://example.com",
    scannedAt: "2026-10-16T12:00:00.000Z",
    findings: [
      {
        id: "headers.hsts.missing",
        category: "headers",
        status: "warning",
        severity: "low",
        title: "HSTS not detected",
        description: "No Strict-Transport-Security header was returned.",
        whyItMatters: "Browsers get less protection against downgrades.",
        recommendation: "Add the header.",
        evidence: [{ label: "Header", value: "(absent)" }],
        confidence: "high",
      },
    ],
    posture: { label: "Needs Attention" },
  } as ScanReport;
}

function makeScan(scannedAt: string): StoredScan {
  return {
    id: `id-${scannedAt}`,
    domainId: "local-domain-id",
    scannedAt,
    postureLabel: "Needs Attention",
    report: makeReport(),
  };
}

function makeDomain(hostname: string, scans: StoredScan[] = []): ExportableDomain {
  return { hostname, createdAt: "2026-10-01T00:00:00.000Z", scans };
}

interface Loose {
  format: string;
  version: number;
  domains: Array<{
    hostname: string;
    addedAt: string;
    scans: Array<{ scannedAt: string; report: { findings: Array<{ status: string }> } }>;
  }>;
}

function backupText(domains: ExportableDomain[]): string {
  return serializeBackup(createBackup(domains, new Date("2026-10-16T18:00:00.000Z")));
}

function mutated(domains: ExportableDomain[], change: (obj: Loose) => void): string {
  const obj = JSON.parse(backupText(domains)) as Loose;
  change(obj);
  return JSON.stringify(obj);
}

describe("backup round trip", () => {
  it("parses what it created", () => {
    const backup = createBackup(
      [makeDomain("example.com", [makeScan("2026-10-15T10:00:00.000Z")])],
      new Date("2026-10-16T18:00:00.000Z"),
    );
    const result = parseBackup(serializeBackup(backup));
    expect(result).toEqual({ ok: true, backup });
  });

  it("accepts a domain with no scans", () => {
    const result = parseBackup(backupText([makeDomain("example.com")]));
    expect(result.ok).toBe(true);
  });

  it("does not leak local IDs or owner information", () => {
    const text = backupText([makeDomain("example.com", [makeScan("2026-10-15T10:00:00.000Z")])]);
    expect(text).not.toContain("local-domain-id");
    expect(text).not.toContain("ownerId");
  });

  it("orders scans oldest first", () => {
    const backup = createBackup([
      makeDomain("example.com", [
        makeScan("2026-10-16T10:00:00.000Z"),
        makeScan("2026-10-14T10:00:00.000Z"),
        makeScan("2026-10-15T10:00:00.000Z"),
      ]),
    ]);
    expect(backup.domains[0].scans.map((s) => s.scannedAt)).toEqual([
      "2026-10-14T10:00:00.000Z",
      "2026-10-15T10:00:00.000Z",
      "2026-10-16T10:00:00.000Z",
    ]);
  });
});

describe("parseBackup rejects bad files", () => {
  it("rejects malformed JSON", () => {
    expect(parseBackup("{not json").ok).toBe(false);
  });

  it("rejects the wrong format marker", () => {
    const text = mutated([makeDomain("example.com")], (o) => {
      o.format = "something-else";
    });
    expect(parseBackup(text).ok).toBe(false);
  });

  it("rejects a backup from a newer version", () => {
    const text = mutated([makeDomain("example.com")], (o) => {
      o.version = 99;
    });
    const result = parseBackup(text);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("newer version");
  });

  it("rejects an oversized file", () => {
    expect(parseBackup("x".repeat(MAX_BACKUP_BYTES + 1)).ok).toBe(false);
  });

  it("rejects more than 25 domains", () => {
    const many = Array.from({ length: 26 }, (_, i) => makeDomain(`site${i}.example.com`));
    expect(parseBackup(backupText(many)).ok).toBe(false);
  });

  it("rejects an IP address as a domain", () => {
    expect(parseBackup(backupText([makeDomain("192.168.0.1")])).ok).toBe(false);
  });

  it("rejects the same domain twice", () => {
    const result = parseBackup(backupText([makeDomain("example.com"), makeDomain("example.com")]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toContain("more than once");
  });

  it("rejects a finding with an invalid status such as 'safe'", () => {
    const text = mutated(
      [makeDomain("example.com", [makeScan("2026-10-15T10:00:00.000Z")])],
      (o) => {
        o.domains[0].scans[0].report.findings[0].status = "safe";
      },
    );
    expect(parseBackup(text).ok).toBe(false);
  });

  it("rejects more than 20 saved scans for one domain", () => {
    const text = mutated(
      [makeDomain("example.com", [makeScan("2026-10-01T00:00:00.000Z")])],
      (o) => {
        const first = o.domains[0].scans[0];
        o.domains[0].scans = Array.from({ length: 21 }, (_, i) => ({
          ...first,
          scannedAt: `2026-10-${String(i + 1).padStart(2, "0")}T00:00:00.000Z`,
        }));
      },
    );
    expect(parseBackup(text).ok).toBe(false);
  });

  it("never echoes file content in error messages", () => {
    const result = parseBackup(backupText([makeDomain("192.168.0.1")]));
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).not.toContain("192.168.0.1");
  });
});

describe("format marker", () => {
  it("is the documented constant", () => {
    expect(BACKUP_FORMAT).toBe("linkguard-backup");
  });
});