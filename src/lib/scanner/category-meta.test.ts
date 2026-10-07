import { describe, expect, it } from "vitest";
import { CATEGORY_LABELS, CATEGORY_ORDER } from "./category-meta";
import { CATEGORIES } from "./types";

describe("category metadata", () => {
  it("displays every category exactly once", () => {
    expect([...CATEGORY_ORDER].sort()).toEqual([...CATEGORIES].sort());
  });

  it("has a non-empty label for every category", () => {
    for (const category of CATEGORIES) {
      expect(CATEGORY_LABELS[category].length).toBeGreaterThan(0);
    }
  });
});