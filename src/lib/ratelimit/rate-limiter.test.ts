import { describe, expect, it } from "vitest";
import { FixedWindowLimiter, formatWait } from "./rate-limiter";

const T0 = 10_000;

describe("FixedWindowLimiter", () => {
  it("allows up to the limit, then refuses with a retry time", () => {
    const limiter = new FixedWindowLimiter({ limit: 2, windowMs: 60_000 });
    expect(limiter.check("a", T0)).toMatchObject({ allowed: true, remaining: 1 });
    expect(limiter.check("a", T0 + 1000)).toMatchObject({ allowed: true, remaining: 0 });
    expect(limiter.check("a", T0 + 2000)).toEqual({
      allowed: false,
      remaining: 0,
      retryAfterSeconds: 58,
    });
  });

  it("starts a fresh window after the old one ends", () => {
    const limiter = new FixedWindowLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check("a", T0).allowed).toBe(true);
    expect(limiter.check("a", T0 + 59_999).allowed).toBe(false);
    expect(limiter.check("a", T0 + 60_000).allowed).toBe(true);
  });

  it("keeps separate budgets per key", () => {
    const limiter = new FixedWindowLimiter({ limit: 1, windowMs: 60_000 });
    expect(limiter.check("a", T0).allowed).toBe(true);
    expect(limiter.check("b", T0).allowed).toBe(true);
    expect(limiter.check("a", T0).allowed).toBe(false);
  });

  it("never tracks more keys than its cap", () => {
    const limiter = new FixedWindowLimiter({ limit: 1, windowMs: 60_000, maxKeys: 3 });
    for (const key of ["a", "b", "c", "d", "e", "f"]) limiter.check(key, T0);
    expect(limiter.size).toBeLessThanOrEqual(3);
  });

  it("always reports at least one second to wait", () => {
    const limiter = new FixedWindowLimiter({ limit: 1, windowMs: 1000 });
    limiter.check("a", T0);
    expect(limiter.check("a", T0 + 999).retryAfterSeconds).toBe(1);
  });
});

describe("formatWait", () => {
  it("uses seconds for short waits", () => {
    expect(formatWait(1)).toBe("1 second");
    expect(formatWait(45)).toBe("45 seconds");
  });

  it("uses whole minutes for long waits", () => {
    expect(formatWait(91)).toBe("2 minutes");
    expect(formatWait(600)).toBe("10 minutes");
  });
});