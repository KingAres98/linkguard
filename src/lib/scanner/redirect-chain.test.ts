import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { followRedirects, MAX_REDIRECTS } from "./redirect-chain";

let server: http.Server;
let port: number;

function base(path: string): string {
  return `http://127.0.0.1:${port}${path}`;
}
// Stands in for the real SSRF guard in tests. Our local test server runs on
// 127.0.0.1, which the REAL guard always (correctly) blocks as loopback, so
// we can't use it to simulate "a normal public redirect." This fake treats
// 127.0.0.1 as acceptable, standing in for "some public server," while still
// rejecting a known-blocked address so the "blocked" test stays meaningful.
async function fakeValidateHost(hostname: string) {
  if (hostname === "169.254.169.254") {
    return { safe: false as const, reason: "cloud-metadata" as const };
  }
  return { safe: true as const, resolvedIps: ["127.0.0.1"] };
}

beforeAll(async () => {
  server = http.createServer((req, res) => {
    switch (req.url) {
      case "/start":
        res.writeHead(302, { Location: base("/middle") });
        res.end();
        return;
      case "/middle":
        res.writeHead(302, { Location: base("/end") });
        res.end();
        return;
      case "/end":
        res.writeHead(200, { "Content-Type": "text/plain" });
        res.end("done");
        return;
      case "/relative":
        res.writeHead(302, { Location: "/end" }); // relative Location header
        res.end();
        return;
      case "/to-private":
        // Points directly at a blocked literal IP. Exercises the same
        // re-validation path a rebinding attack would need to get past.
        res.writeHead(302, { Location: "http://169.254.169.254/steal" });
        res.end();
        return;
      case "/loop-a":
        res.writeHead(302, { Location: base("/loop-b") });
        res.end();
        return;
      case "/loop-b":
        res.writeHead(302, { Location: base("/loop-a") });
        res.end();
        return;
      case "/bad-location":
        res.writeHead(302, { Location: "http://" }); // invalid target
        res.end();
        return;
      default:
        res.writeHead(404);
        res.end();
    }
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  server.close();
});

describe("followRedirects", () => {
  it("follows a normal chain to a successful final response", async () => {
        const result = await followRedirects(new URL(base("/start")), "127.0.0.1", fakeValidateHost);
    expect(result.kind).toBe("final");
    expect(result.hops.map((h) => h.status)).toEqual([302, 302, 200]);
  });

  it("resolves a relative Location header against the current URL", async () => {
        const result = await followRedirects(new URL(base("/relative")), "127.0.0.1", fakeValidateHost);
    expect(result.kind).toBe("final");
  });

  it("blocks the chain when a hop redirects to a private/blocked address", async () => {
        const result = await followRedirects(new URL(base("/to-private")), "127.0.0.1", fakeValidateHost);
    expect(result.kind).toBe("blocked");
    if (result.kind === "blocked") {
      expect(result.blockedUrl).toContain("169.254.169.254");
      expect(result.reason).toBe("cloud-metadata");
    }
    // Exactly one hop recorded (the /to-private response itself); we must
    // NEVER have attempted to connect to the blocked address.
    expect(result.hops).toHaveLength(1);
  });

  it("stops after MAX_REDIRECTS hops on an infinite loop", async () => {
        const result = await followRedirects(new URL(base("/loop-a")), "127.0.0.1", fakeValidateHost);
    expect(result.kind).toBe("too-many-redirects");
    expect(result.hops.length).toBe(MAX_REDIRECTS + 1);
  });

  it("reports an invalid Location header instead of throwing", async () => {
    const result = await followRedirects(new URL(base("/bad-location")), "127.0.0.1");
    expect(result.kind).toBe("invalid-redirect");
  });
});