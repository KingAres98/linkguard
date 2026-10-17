import { describe, expect, it } from "vitest";
import { describeError, redactSecrets } from "./safe-error";

describe("redactSecrets", () => {
  it("removes every URL, including its query string", () => {
    const out = redactSecrets(
      "request to https://feeds.example/list?key=abc123 failed",
      {},
    );
    expect(out).toBe("request to [url redacted] failed");
  });

  it("removes a known secret value even when it is not part of a URL", () => {
    const out = redactSecrets("bad credential tok_1234567890 rejected", {
      FEED_TOKEN: "tok_1234567890",
    });
    expect(out).toBe("bad credential [redacted] rejected");
  });

  it("removes the secret when it is the whole URL", () => {
    const secret = "https://feeds.example/private/abcdef123456";
    const out = redactSecrets(`fetch of ${secret} failed`, {
      URLHAUS_HOSTFILE_URL: secret,
    });
    expect(out).not.toContain("abcdef123456");
    expect(out).not.toContain("feeds.example");
  });

  it("ignores values that are too short to be secrets", () => {
    expect(redactSecrets("abc is fine", { SHORT_KEY: "abc" })).toBe(
      "abc is fine",
    );
  });

  it("only treats variables with secret-like names as secrets", () => {
    expect(
      redactSecrets("running in production mode", { NODE_ENV: "production" }),
    ).toBe("running in production mode");
  });
});

describe("describeError", () => {
  it("prints the error name and a redacted message", () => {
    const error = new TypeError(
      "fetch failed for https://feeds.example/x?key=SECRETVALUE",
    );
    expect(describeError(error, {})).toBe(
      "TypeError: fetch failed for [url redacted]",
    );
  });

  it("adds the low-level cause code, which is safe and useful", () => {
    const cause = Object.assign(new Error("socket hang up"), {
      code: "ECONNRESET",
    });
    const error = Object.assign(new TypeError("fetch failed"), { cause });
    expect(describeError(error, {})).toBe(
      "TypeError: fetch failed (cause: ECONNRESET)",
    );
  });

  it("never prints a stack trace", () => {
    expect(describeError(new Error("boom"), {})).toBe("Error: boom");
  });

  it("does not guess at things that are not errors", () => {
    expect(describeError("https://feeds.example/?key=abc12345", {})).toBe(
      "Unknown error (details withheld).",
    );
    expect(describeError(undefined, {})).toBe(
      "Unknown error (details withheld).",
    );
  });
});