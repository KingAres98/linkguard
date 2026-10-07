import { describe, expect, it } from "vitest";
import { candidateHosts, isPublicSuffix } from "./match";

describe("candidateHosts", () => {
  it("returns the host and its parents, stopping at the registrable domain", () => {
    expect(candidateHosts("a.b.evil.com")).toEqual(["a.b.evil.com", "b.evil.com", "evil.com"]);
  });

  it("never goes up to a multi-part public suffix", () => {
    expect(candidateHosts("login.evil.co.uk")).toEqual(["login.evil.co.uk", "evil.co.uk"]);
  });

  it("treats sites on shared platforms as separate sites", () => {
    expect(candidateHosts("bar.foo.github.io")).toEqual(["bar.foo.github.io", "foo.github.io"]);
  });

  it("lowercases and strips a trailing dot", () => {
    expect(candidateHosts("Login.EVIL.com.")).toEqual(["login.evil.com", "evil.com"]);
  });

  it("returns nothing for IP addresses", () => {
    expect(candidateHosts("203.0.113.9")).toEqual([]);
  });
});

describe("isPublicSuffix", () => {
  it("recognizes public suffixes, including platform ones", () => {
    expect(isPublicSuffix("com")).toBe(true);
    expect(isPublicSuffix("co.uk")).toBe(true);
    expect(isPublicSuffix("github.io")).toBe(true);
  });

  it("does not flag ordinary domains", () => {
    expect(isPublicSuffix("evil.com")).toBe(false);
    expect(isPublicSuffix("foo.github.io")).toBe(false);
  });
});