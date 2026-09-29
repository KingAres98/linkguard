import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { fetchOnce } from "./http-fetch";

let server: http.Server;
let port: number;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/redirect") {
      res.writeHead(302, { Location: "https://example.com/" });
      res.end();
      return;
    }
    if (req.url === "/big") {
      res.writeHead(200, { "Content-Type": "text/plain" });
      res.end("x".repeat(2000));
      return;
    }
    if (req.url === "/hang") {
      return; // never respond
    }
    res.writeHead(200, { "Content-Type": "text/plain", "X-Test": "yes" });
    res.end("hello");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  server.close();
});

function localUrl(path: string): URL {
  return new URL(`http://127.0.0.1:${port}${path}`);
}

describe("fetchOnce", () => {
  it("returns a success outcome for a normal response", async () => {
    const outcome = await fetchOnce(localUrl("/"), "127.0.0.1");
    expect(outcome.kind).toBe("success");
    if (outcome.kind === "success") {
      expect(outcome.status).toBe(200);
      expect(outcome.headers["x-test"]).toBe("yes");
    }
  });

  it("returns a redirect outcome without following it", async () => {
    const outcome = await fetchOnce(localUrl("/redirect"), "127.0.0.1");
    expect(outcome.kind).toBe("redirect");
    if (outcome.kind === "redirect") {
      expect(outcome.status).toBe(302);
      expect(outcome.location).toBe("https://example.com/");
    }
  });

  it("stops and reports an error when the response exceeds the size limit", async () => {
    const outcome = await fetchOnce(localUrl("/big"), "127.0.0.1", { maxResponseBytes: 500 });
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") expect(outcome.reason).toBe("too-large");
  });

  it("times out if the server never responds", async () => {
    const outcome = await fetchOnce(localUrl("/hang"), "127.0.0.1", { timeoutMs: 200 });
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") expect(outcome.reason).toBe("timeout");
  });

  it("reports a network error when the connection is refused", async () => {
    const outcome = await fetchOnce(new URL("http://127.0.0.1:1"), "127.0.0.1", { timeoutMs: 500 });
    expect(outcome.kind).toBe("error");
    if (outcome.kind === "error") expect(outcome.reason).toBe("network");
  });
});