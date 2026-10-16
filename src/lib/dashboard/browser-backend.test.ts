import { afterEach, describe, expect, it, vi } from "vitest";
import { createBrowserBackend } from "./browser-backend";
import type { ScanReport } from "@/lib/scanner/types";
import { createMemoryStore } from "@/lib/storage/memory-store";

afterEach(() => {
  vi.unstubAllGlobals();
});

const REPORT = {
  target: "https://example.com",
  posture: { label: "Needs Attention" },
  findings: [],
} as unknown as ScanReport;

function stubFetch(response: Response) {
  const fn = vi.fn(async () => response.clone());
  vi.stubGlobal("fetch", fn);
  return fn;
}

async function setup() {
  const backend = createBrowserBackend(createMemoryStore());
  const added = await backend.addDomain("example.com");
  if (!added.ok) throw new Error("setup failed");
  return { backend, domain: added.data.domain };
}

describe("browser backend", () => {
  it("rejects an invalid hostname", async () => {
    const backend = createBrowserBackend(createMemoryStore());
    const result = await backend.addDomain("not a domain!!");
    expect(result.ok).toBe(false);
  });

  it("adds a domain and lists it as not yet scanned", async () => {
    const { backend } = await setup();
    const result = await backend.listDomains();
    expect(result.ok && result.data.domains).toHaveLength(1);
    if (result.ok) {
      expect(result.data.domains[0].hostname).toBe("example.com");
      expect(result.data.domains[0].latest).toBeNull();
    }
  });

  it("does not duplicate a domain added twice", async () => {
    const { backend } = await setup();
    await backend.addDomain("example.com");
    const result = await backend.listDomains();
    expect(result.ok && result.data.domains).toHaveLength(1);
  });

  it("enforces the 25 domain limit", async () => {
    const backend = createBrowserBackend(createMemoryStore());
    for (let i = 0; i < 25; i++) {
      const added = await backend.addDomain(`site${i}.example.com`);
      expect(added.ok).toBe(true);
    }
    const over = await backend.addDomain("one-too-many.example.com");
    expect(over.ok).toBe(false);
    if (!over.ok) expect(over.error).toContain("at most 25");
  });

  it("scans through /api/scan and saves the result locally", async () => {
    const fetchMock = stubFetch(Response.json({ report: REPORT }));
    const { backend, domain } = await setup();

    const scan = await backend.scanDomain(domain);
    expect(scan.ok).toBe(true);

    const [path, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(path).toBe("/api/scan");
    expect(JSON.parse(init.body as string)).toEqual({ url: "example.com" });

    const list = await backend.listDomains();
    if (!list.ok) throw new Error("list failed");
    expect(list.data.domains[0].latest?.postureLabel).toBe("Needs Attention");
  });

  it("saves nothing when the server refuses the scan", async () => {
    stubFetch(Response.json({ error: "That address is not allowed." }, { status: 400 }));
    const { backend, domain } = await setup();

    const scan = await backend.scanDomain(domain);
    expect(scan).toEqual({ ok: false, error: "That address is not allowed." });

    const history = await backend.listScans(domain.id);
    expect(history.ok && history.data.scans).toHaveLength(0);
  });

  it("rejects a malformed report from the server", async () => {
    stubFetch(Response.json({ report: { posture: "nope" } }));
    const { backend, domain } = await setup();
    const scan = await backend.scanDomain(domain);
    expect(scan.ok).toBe(false);
  });

  it("lists history newest first, clears it, and removes the domain", async () => {
    stubFetch(Response.json({ report: REPORT }));
    const { backend, domain } = await setup();
    await backend.scanDomain(domain);
    await backend.scanDomain(domain);

    const history = await backend.listScans(domain.id);
    expect(history.ok && history.data.scans).toHaveLength(2);

    const cleared = await backend.clearScans(domain.id);
    expect(cleared).toEqual({ ok: true, data: { deleted: 2 } });

    const removed = await backend.removeDomain(domain.id);
    expect(removed.ok).toBe(true);
    const again = await backend.removeDomain(domain.id);
    expect(again.ok).toBe(false);
  });
});