import { describe, it, expect } from "vitest";
import { POST } from "./route";

const JSON_HEADERS = { "Content-Type": "application/json" };

function makeRequest(body: string, headers: Record<string, string> = JSON_HEADERS) {
  return new Request("http://localhost/api/scan", {
    method: "POST",
    headers,
    body,
  });
}

describe("POST /api/scan", () => {
  it("returns a report for a valid url", async () => {
    const response = await POST(makeRequest(JSON.stringify({ url: "https://example.com" })));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const data = await response.json();
    expect(data.report.target).toBe("https://example.com");
    expect(Array.isArray(data.report.findings)).toBe(true);
  });

  it("rejects a non-JSON content type with 415", async () => {
    const response = await POST(
      makeRequest("url=https://example.com", { "Content-Type": "text/plain" }),
    );
    expect(response.status).toBe(415);
  });

  it("rejects malformed JSON with 400", async () => {
    const response = await POST(makeRequest("{not json"));
    expect(response.status).toBe(400);
  });

  it("rejects a missing url with 400", async () => {
    const response = await POST(makeRequest(JSON.stringify({})));
    expect(response.status).toBe(400);
  });

  it("rejects an oversized body with 413", async () => {
    const response = await POST(makeRequest(JSON.stringify({ url: "a".repeat(5000) })));
    expect(response.status).toBe(413);
  });

  it("rejects an over-length url with 400 and does not echo it back", async () => {
    const longUrl = "a".repeat(3000);
    const response = await POST(makeRequest(JSON.stringify({ url: longUrl })));
    expect(response.status).toBe(400);
    const text = await response.text();
    expect(text).not.toContain("aaaaaaaaaa");
  });
});