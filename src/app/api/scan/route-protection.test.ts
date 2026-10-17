import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ConcurrencyGate } from "@/lib/ratelimit/concurrency-gate";
import { FixedWindowLimiter } from "@/lib/ratelimit/rate-limiter";
import { setScanProtectionForTesting } from "@/lib/ratelimit/scan-protection";
import { runScan } from "@/lib/scanner/scan";
import { POST } from "./route";

// No real network in these tests.
vi.mock("@/lib/scanner/scan", () => ({ runScan: vi.fn() }));

const OK = { ok: true, report: { target: "https://x.test/" } } as never;

function protection(opts: { client?: number; target?: number; concurrent?: number } = {}) {
  return {
    perClient: new FixedWindowLimiter({ limit: opts.client ?? 100, windowMs: 600_000 }),
    perTarget: new FixedWindowLimiter({ limit: opts.target ?? 100, windowMs: 60_000 }),
    gate: new ConcurrencyGate(opts.concurrent ?? 10),
  };
}

function scanRequest(url: string, ip = "203.0.113.5") {
  return new Request("http://localhost/api/scan", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-test-ip": ip },
    body: JSON.stringify({ url }),
  });
}

beforeEach(() => {
  vi.stubEnv("LINKGUARD_CLIENT_IP_HEADER", "x-test-ip");
  vi.mocked(runScan).mockResolvedValue(OK);
});

afterEach(() => {
  vi.unstubAllEnvs();
  setScanProtectionForTesting(null);
  vi.clearAllMocks();
});

describe("scan route protection", () => {
  it("answers 429 with Retry-After once a client exceeds its budget, without echoing input", async () => {
    setScanProtectionForTesting(protection({ client: 2 }));
    expect((await POST(scanRequest("https://one.example.com"))).status).toBe(200);
    expect((await POST(scanRequest("https://two.example.com"))).status).toBe(200);

    const limited = await POST(scanRequest("https://leakcheck.example.com"));
    expect(limited.status).toBe(429);
    expect(Number(limited.headers.get("retry-after"))).toBeGreaterThan(0);
    expect(await limited.text()).not.toContain("leakcheck");
  });

  it("keeps separate budgets for different clients", async () => {
    setScanProtectionForTesting(protection({ client: 1 }));
    expect((await POST(scanRequest("https://a.example.com", "203.0.113.1"))).status).toBe(200);
    expect((await POST(scanRequest("https://b.example.com", "203.0.113.1"))).status).toBe(429);
    expect((await POST(scanRequest("https://c.example.com", "203.0.113.2"))).status).toBe(200);
  });

  it("limits repeated scans of the same site, across clients, but not other sites", async () => {
    setScanProtectionForTesting(protection({ target: 1 }));
    expect((await POST(scanRequest("https://example.com", "203.0.113.1"))).status).toBe(200);
    expect((await POST(scanRequest("https://EXAMPLE.com/other", "203.0.113.2"))).status).toBe(429);
    expect((await POST(scanRequest("https://example.org", "203.0.113.3"))).status).toBe(200);
  });

  it("returns 503 while too many scans are already running", async () => {
    setScanProtectionForTesting(protection({ concurrent: 1 }));

    let finish!: () => void;
    vi.mocked(runScan).mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          finish = () => resolve(OK);
        }),
    );

    const first = POST(scanRequest("https://slow.example.com"));
    await vi.waitFor(() => expect(runScan).toHaveBeenCalledTimes(1));

    const busy = await POST(scanRequest("https://other.example.com"));
    expect(busy.status).toBe(503);
    expect(busy.headers.get("retry-after")).toBe("5");

    finish();
    expect((await first).status).toBe(200);
    expect((await POST(scanRequest("https://third.example.com"))).status).toBe(200);
  });

  it("frees the slot even when a scan throws", async () => {
    setScanProtectionForTesting(protection({ concurrent: 1 }));
    vi.mocked(runScan).mockRejectedValueOnce(new Error("boom"));

    await expect(POST(scanRequest("https://broken.example.com"))).rejects.toThrow("boom");
    expect((await POST(scanRequest("https://fine.example.com"))).status).toBe(200);
  });
});