import { describe, it, expect } from "vitest";
import { sortFindings } from "./sort";
import type { Finding, Severity, Status } from "./types";

function makeFinding(id: string, status: Status, severity: Severity = "info"): Finding {
  return {
    id,
    category: "headers",
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