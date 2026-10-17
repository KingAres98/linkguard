import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
const MARKER = "@media (prefers-reduced-motion: reduce)";

describe("global styles: motion", () => {
  it("has a reduced-motion block", () => {
    expect(css).toContain(MARKER);
  });

  it("switches off every animated class, and the page sweep, there", () => {
    const animated = [...css.matchAll(/(\.lg-[a-z-]+)\s*\{[^}]*animation:/g)].map(
      (match) => match[1],
    );
    expect(animated.length).toBeGreaterThan(0);

    const reduced = css.slice(css.indexOf(MARKER));
    for (const name of animated) {
      expect(reduced).toContain(name);
    }
    expect(reduced).toContain("body::after");
  });
});