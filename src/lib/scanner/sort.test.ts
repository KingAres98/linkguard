import { describe, it, expect } from "vitest";
import { sortFindings, groupByCategory } from "./sort";
import type { Category, Finding, Severity, Status } from "./types";

function makeFinding(
  id: string,
  status: Status,
  severity: Severity = "info",
  category: Category = "headers",
): Finding {
  return {
    id,
    category,
    status,
    severity,
    title: id,
    description: "",
    whyItMatters: "",
    recommendation: "",
    evidence: [],
    confidence: "high",
  };
}

describe("sortFindings", () => {
  it("orders by status: fail, warning, unknown, info, pass", () => {
    const sorted = sortFindings([
      makeFinding("a", "pass"),
      makeFinding("b", "info"),
      makeFinding("c", "fail"),
      makeFinding("d", "unknown"),
      makeFinding("e", "warning"),
    ]);
    expect(sorted.map((f) => f.id)).toEqual(["c", "e", "d", "b", "a"]);
  });

  it("orders by severity within the same status, highest first", () => {
    const sorted = sortFindings([
      makeFinding("low", "warning", "low"),
      makeFinding("high", "warning", "high"),
      makeFinding("medium", "warning", "medium"),
    ]);
    expect(sorted.map((f) => f.id)).toEqual(["high", "medium", "low"]);
  });

  it("does not mutate the input array", () => {
    const input = [makeFinding("a", "pass"), makeFinding("b", "fail")];
    sortFindings(input);
    expect(input.map((f) => f.id)).toEqual(["a", "b"]);
  });
});

describe("groupByCategory", () => {
  it("groups findings under their category", () => {
    const groups = groupByCategory([
      makeFinding("a", "pass", "info", "tls"),
      makeFinding("b", "fail", "high", "headers"),
    ]);
    expect(groups.map((g) => g.category)).toEqual(["tls", "headers"]);
  });

  it("omits categories with no findings", () => {
    const groups = groupByCategory([makeFinding("a", "pass", "info", "dns")]);
    expect(groups).toHaveLength(1);
    expect(groups[0].category).toBe("dns");
  });

  it("follows the fixed CATEGORY_ORDER regardless of input order", () => {
    const groups = groupByCategory([
      makeFinding("a", "pass", "info", "email"),
      makeFinding("b", "pass", "info", "url"),
    ]);
    expect(groups.map((g) => g.category)).toEqual(["url", "email"]);
  });
});