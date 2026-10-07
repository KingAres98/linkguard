import { afterEach, describe, expect, it, vi } from "vitest";
import { downloadText } from "./download";

const URL = "https://lists.example/feed.txt";
const OPTIONS = { maxBytes: 1000, timeoutMs: 5000 };

afterEach(() => {
  vi.unstubAllGlobals();
});

function stubFetch(response: Response) {
  const fn = vi.fn(async () => response);
  vi.stubGlobal("fetch", fn);
  return fn;
}

describe("downloadText", () => {
  it("returns the body as text", async () => {
    stubFetch(new Response("evil.com\nphish.example.org\n"));
    expect(await downloadText(URL, OPTIONS)).toBe("evil.com\nphish.example.org\n");
  });

  it("rejects a non-success status", async () => {
    stubFetch(new Response("nope", { status: 503 }));
    await expect(downloadText(URL, OPTIONS)).rejects.toThrow("HTTP 503");
  });

  it("rejects a body larger than the limit, even without a Content-Length header", async () => {
    stubFetch(new Response("x".repeat(5000)));
    await expect(downloadText(URL, OPTIONS)).rejects.toThrow("larger than the allowed size");
  });

  it("refuses to follow redirects and always sets a timeout", async () => {
    const fn = stubFetch(new Response("ok.example.com"));
    await downloadText(URL, OPTIONS);
    const init = (fn.mock.calls[0] as unknown as [string, RequestInit])[1];
    expect(init.redirect).toBe("error");
    expect(init.signal).toBeInstanceOf(AbortSignal);
  });
});