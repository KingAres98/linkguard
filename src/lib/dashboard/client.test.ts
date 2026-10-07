import { afterEach, describe, expect, it, vi } from "vitest";
import { requestJson } from "./client";

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: Response | Error) {
  const fn = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("requestJson", () => {
  it("returns the parsed data on success", async () => {
    stubFetch(Response.json({ domains: [] }));
    const result = await requestJson<{ domains: unknown[] }>("/api/domains");
    expect(result).toEqual({ ok: true, data: { domains: [] } });
  });

  it("surfaces the server's error message", async () => {
    stubFetch(Response.json({ error: "Domain not found." }, { status: 404 }));
    const result = await requestJson("/api/domains/x");
    expect(result).toEqual({ ok: false, error: "Domain not found." });
  });

  it("uses a generic message when the error body is not a string", async () => {
    stubFetch(Response.json({ error: { nested: "object" } }, { status: 500 }));
    const result = await requestJson("/api/domains");
    expect(result).toEqual({ ok: false, error: "The request failed. Please try again." });
  });

  it("does not crash on a non-JSON error response", async () => {
    stubFetch(new Response("<html>Bad gateway</html>", { status: 502 }));
    const result = await requestJson("/api/domains");
    expect(result).toEqual({ ok: false, error: "The request failed. Please try again." });
  });

  it("treats a non-JSON success response as an error", async () => {
    stubFetch(new Response("not json", { status: 200 }));
    const result = await requestJson("/api/domains");
    expect(result).toEqual({ ok: false, error: "Unexpected response from the server." });
  });

  it("turns a network failure into a friendly message", async () => {
    stubFetch(new TypeError("fetch failed"));
    const result = await requestJson("/api/domains");
    expect(result).toEqual({
      ok: false,
      error: "Could not reach the server. Check your connection and try again.",
    });
  });

  it("always passes a timeout signal to fetch", async () => {
    const fn = stubFetch(Response.json({}));
    await requestJson("/api/domains");
    const init = fn.mock.calls[0] as unknown as [string, RequestInit];
    expect(init[1].signal).toBeInstanceOf(AbortSignal);
  });
});