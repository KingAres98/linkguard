import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ScanReport } from "@/lib/scanner/types";
import { runScan } from "@/lib/scanner/scan";
import { setStoreForTesting } from "@/lib/storage";
import { createMemoryStore } from "@/lib/storage/memory-store";
import { GET, POST } from "./route";
import { DELETE } from "./[id]/route";
import { POST as SCAN } from "./[id]/scan/route";
import { DELETE as CLEAR, GET as HISTORY } from "./[id]/scans/route";
vi.mock("@/lib/scanner/scan", () => ({ runScan: vi.fn() }));

function req(method: string, body?: unknown, headers: Record<string, string> = {}) {
  return new Request("http://localhost/api/domains", {
    method,
    headers: body === undefined ? headers : { "Content-Type": "application/json", ...headers },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
}

function ctx(id: string) {
  return { params: Promise.resolve({ id }) };
}

function makeReport(target: string, label: string): ScanReport {
  return { target, scannedAt: new Date().toISOString(), findings: [], posture: { label } };
}

async function addDomain(hostname: string) {
  const res = await POST(req("POST", { hostname }));
  return (await res.json()).domain as { id: string; hostname: string };
}

beforeEach(() => {
  process.env.LINKGUARD_DASHBOARD_ENABLED = "true";
  setStoreForTesting(createMemoryStore());
  vi.mocked(runScan).mockReset();
});

afterEach(() => {
  delete process.env.LINKGUARD_DASHBOARD_ENABLED;
  setStoreForTesting(undefined);
});

describe("dashboard guard", () => {
  it("answers 404 on every route when the feature flag is off", async () => {
    delete process.env.LINKGUARD_DASHBOARD_ENABLED;
    expect((await CLEAR(req("DELETE"), ctx("x"))).status).toBe(404);
    expect((await POST(req("POST", { hostname: "example.com" }))).status).toBe(404);
    expect((await DELETE(req("DELETE"), ctx("x"))).status).toBe(404);
    expect((await SCAN(req("POST"), ctx("x"))).status).toBe(404);
    expect((await HISTORY(req("GET"), ctx("x"))).status).toBe(404);
  });

  it("refuses cross-site browser requests", async () => {
    const res = await GET(req("GET", undefined, { "Sec-Fetch-Site": "cross-site" }));
    expect(res.status).toBe(403);
  });

  it("allows same-origin browser requests", async () => {
    const res = await GET(req("GET", undefined, { "Sec-Fetch-Site": "same-origin" }));
    expect(res.status).toBe(200);
  });
});

describe("POST /api/domains", () => {
  it("adds a domain and normalizes it to a bare lowercase hostname", async () => {
    const res = await POST(req("POST", { hostname: "https://WWW.Example.com/some/path" }));
    expect(res.status).toBe(201);
    expect((await res.json()).domain.hostname).toBe("www.example.com");
  });

  it("returns the existing domain instead of a duplicate", async () => {
    const first = await addDomain("example.com");
    const res = await POST(req("POST", { hostname: "example.com" }));
    expect(res.status).toBe(200);
    expect((await res.json()).domain.id).toBe(first.id);
  });

  it.each([
    ["an IPv4 address", { hostname: "192.168.1.1" }],
    ["an obfuscated IP", { hostname: "http://2130706433" }],
    ["localhost", { hostname: "localhost" }],
    ["a single-label name", { hostname: "intranet" }],
    ["a non-string", { hostname: 42 }],
    ["a missing field", {}],
  ])("rejects %s with 400", async (_name, body) => {
    expect((await POST(req("POST", body))).status).toBe(400);
  });

  it("does not echo rejected input back", async () => {
    const res = await POST(req("POST", { hostname: "192.168.77.77" }));
    expect(await res.text()).not.toContain("192.168.77.77");
  });

  it("rejects a non-JSON content type with 415", async () => {
    const res = await POST(
      new Request("http://localhost/api/domains", {
        method: "POST",
        headers: { "Content-Type": "text/plain" },
        body: "hostname=example.com",
      }),
    );
    expect(res.status).toBe(415);
  });

  it("rejects malformed JSON with 400 and oversized bodies with 413", async () => {
    const bad = await POST(
      new Request("http://localhost/api/domains", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{nope",
      }),
    );
    expect(bad.status).toBe(400);
    expect((await POST(req("POST", { hostname: "a".repeat(2000) }))).status).toBe(413);
  });

  it("enforces the maximum number of tracked domains", async () => {
    for (let i = 0; i < 25; i++) await addDomain(`site${i}.example.com`);
    const res = await POST(req("POST", { hostname: "one-too-many.example.com" }));
    expect(res.status).toBe(409);
  });
});

describe("scanning and history", () => {
  it("lists domains with their latest posture", async () => {
    const domain = await addDomain("example.com");
    expect((await (await GET(req("GET"))).json()).domains[0].latest).toBeNull();

    vi.mocked(runScan).mockResolvedValue({
      ok: true,
      report: makeReport("https://example.com/", "Needs Attention"),
    });
    await SCAN(req("POST"), ctx(domain.id));

    const listed = await (await GET(req("GET"))).json();
    expect(listed.domains[0].latest.postureLabel).toBe("Needs Attention");
  });

  it("scans a tracked domain, saves the result, and scans its hostname", async () => {
    const domain = await addDomain("example.com");
    vi.mocked(runScan).mockResolvedValue({
      ok: true,
      report: makeReport("https://example.com/", "Needs Attention"),
    });

    const res = await SCAN(req("POST"), ctx(domain.id));
    expect(res.status).toBe(201);
    expect(runScan).toHaveBeenCalledWith("example.com");

    const history = await (await HISTORY(req("GET"), ctx(domain.id))).json();
    expect(history.scans).toHaveLength(1);
  });

  it("returns 404 when scanning an unknown domain, without running a scan", async () => {
    const res = await SCAN(req("POST"), ctx("no-such-id"));
    expect(res.status).toBe(404);
    expect(runScan).not.toHaveBeenCalled();
  });

  it("saves nothing when the scan itself fails", async () => {
    const domain = await addDomain("example.com");
    vi.mocked(runScan).mockResolvedValue({ ok: false, error: "That does not look like a valid URL." });

    expect((await SCAN(req("POST"), ctx(domain.id))).status).toBe(400);
    const history = await (await HISTORY(req("GET"), ctx(domain.id))).json();
    expect(history.scans).toEqual([]);
  });

  it("lists history newest first", async () => {
    const domain = await addDomain("example.com");
    vi.mocked(runScan)
      .mockResolvedValueOnce({ ok: true, report: makeReport("t", "Needs Attention") })
      .mockResolvedValueOnce({ ok: true, report: makeReport("t", "Good Configuration Observed") });

    await SCAN(req("POST"), ctx(domain.id));
    await SCAN(req("POST"), ctx(domain.id));

    const history = await (await HISTORY(req("GET"), ctx(domain.id))).json();
    expect(history.scans.map((s: { postureLabel: string }) => s.postureLabel)).toEqual([
      "Good Configuration Observed",
      "Needs Attention",
    ]);
  });
});

describe("DELETE /api/domains/[id]", () => {
  it("deletes a domain, then reports 404 for it", async () => {
    const domain = await addDomain("example.com");
    expect((await DELETE(req("DELETE"), ctx(domain.id))).status).toBe(200);
    expect((await (await GET(req("GET"))).json()).domains).toEqual([]);
    expect((await DELETE(req("DELETE"), ctx(domain.id))).status).toBe(404);
  });
  
describe("clearing history", () => {
  it("deletes the saved scans but keeps the domain tracked", async () => {
    const domain = await addDomain("example.com");
    vi.mocked(runScan).mockResolvedValue({
      ok: true,
      report: makeReport("https://example.com/", "Needs Attention"),
    });
    await SCAN(req("POST"), ctx(domain.id));
    await SCAN(req("POST"), ctx(domain.id));

    const res = await CLEAR(req("DELETE"), ctx(domain.id));
    expect(res.status).toBe(200);
    expect((await res.json()).removed).toBe(2);

    const history = await (await HISTORY(req("GET"), ctx(domain.id))).json();
    expect(history.scans).toEqual([]);

    const listed = await (await GET(req("GET"))).json();
    expect(listed.domains).toHaveLength(1);
    expect(listed.domains[0].latest).toBeNull();
  });

  it("returns 404 for an unknown domain", async () => {
    expect((await CLEAR(req("DELETE"), ctx("no-such-id"))).status).toBe(404);
  });
});
});