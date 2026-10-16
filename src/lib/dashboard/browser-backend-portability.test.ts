import "fake-indexeddb/auto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createServerBackend } from "./backend";
import { createBrowserBackend } from "./browser-backend";
import { createBackup, parseBackup, serializeBackup } from "@/lib/portability/backup";
import type { ScanReport } from "@/lib/scanner/types";
import { createIndexedDbStore } from "@/lib/storage/indexeddb-store";

afterEach(() => {
  vi.unstubAllGlobals();
});

const REPORT = {
  target: "https://example.com",
  scannedAt: "2026-10-16T12:00:00.000Z",
  findings: [],
  posture: { label: "Needs Attention" },
} as unknown as ScanReport;

const freshBackend = () => createBrowserBackend(createIndexedDbStore(`test-${crypto.randomUUID()}`));

/** "Device A": two tracked domains, one of them scanned twice. Returns its backup text. */
async function deviceABackupText(): Promise<string> {
  const response = Response.json({ report: REPORT });
  vi.stubGlobal("fetch", vi.fn(async () => response.clone()));

  const a = freshBackend();
  const first = await a.addDomain("example.com");
  await a.addDomain("example.org");
  if (!first.ok) throw new Error("setup failed");
  await a.scanDomain(first.data.domain);
  await a.scanDomain(first.data.domain);

  const exported = await a.exportData();
  if (!exported.ok) throw new Error("export failed");
  return serializeBackup(createBackup(exported.data.domains));
}

describe("export on one device, import on another", () => {
  it("produces a backup that passes strict validation", async () => {
    expect(parseBackup(await deviceABackupText()).ok).toBe(true);
  });

  it("restores domains and history on the second device", async () => {
    const text = await deviceABackupText();
    const b = freshBackend();

    const result = await b.applyImport(text, "backup");
    expect(result.ok && result.data.summary).toMatchObject({ domainsAdded: 2, scansImported: 2 });

    const list = await b.listDomains();
    if (!list.ok) throw new Error("list failed");
    expect(list.data.domains).toHaveLength(2);
    const example = list.data.domains.find((d) => d.hostname === "example.com");
    expect(example?.latest?.postureLabel).toBe("Needs Attention");
  });

  it("previewImport reports the changes but writes nothing", async () => {
    const text = await deviceABackupText();
    const b = freshBackend();

    const preview = await b.previewImport(text, "backup");
    expect(preview.ok && preview.data.summary.domainsAdded).toBe(2);

    const list = await b.listDomains();
    expect(list.ok && list.data.domains).toHaveLength(0);
  });
});

describe("other import paths", () => {
  it("imports a plain domain list", async () => {
    const b = freshBackend();
    const result = await b.applyImport("example.com\nexample.org\n", "list");
    expect(result.ok && result.data.summary.domainsAdded).toBe(2);
  });

  it("rejects the wrong kind of file and server mode", async () => {
    const b = freshBackend();
    expect((await b.applyImport("example.com\n", "backup")).ok).toBe(false);
    expect((await createServerBackend().exportData()).ok).toBe(false);
  });
});