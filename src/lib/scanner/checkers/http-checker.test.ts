import { describe, it, expect, beforeAll, afterAll } from "vitest";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { checkHttpResponse } from "./http-checker";

let server: http.Server;
let port: number;

beforeAll(async () => {
  server = http.createServer((req, res) => {
    if (req.url === "/redirect") {
      res.writeHead(302, { Location: "https://example.com/" });
      res.end();
      return;
    }
    res.writeHead(200);
    res.end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

afterAll(() => {
  server.close();
});

describe("checkHttpResponse", () => {
  it("produces a pass finding for a normal response", async () => {
    const { finding, outcome } = await checkHttpResponse(new URL(`http://127.0.0.1:${port}/`), "127.0.0.1");
    expect(outcome.kind).toBe("success");
    expect(finding.status).toBe("pass");
    expect(finding.id).toBe("http.response.received");
  });

  it("produces an info finding for a redirect and notes it was not followed", async () => {
    const { finding } = await checkHttpResponse(new URL(`http://127.0.0.1:${port}/redirect`), "127.0.0.1");
    expect(finding.id).toBe("http.response.redirect");
    expect(finding.limitations).toContain("does not yet follow");
  });

  it("produces an unknown-status finding when the connection is refused", async () => {
    const { finding } = await checkHttpResponse(new URL("http://127.0.0.1:1/"), "127.0.0.1");
    expect(finding.status).toBe("unknown");
  });
});