import { describe, it, expect } from "vitest";
import { summarizeFindings } from "./summary";
import type { Finding, Status } from "./types";

// Test helper: builds a valid Finding so each test only states what matters.
function makeFinding(status: Status, id = "test.finding"): Finding {
  return {
    id,
    category: "headers",
    status,
    severity: "info",
    title: "Test finding",
    description: "Test description",
    whyItMatters: "Test reason",
    recommendation: "",
    evidence: [],
    confidence: "high",
  };
}

describe("summarizeFindings", () => {
  it("returns all zeros for no findings", () => {
    expect(summarizeFindings([])).toEqual({
      total: 0,
      pass: 0,
      warning: 0,
      fail: 0,
      info: 0,
      unknown: 0,
    });
  });

  it("counts each status correctly", () => {
    const findings = [
      makeFinding("pass"),
      makeFinding("pass"),
      makeFinding("pass"),
      makeFinding("warning"),
      makeFinding("warning"),
      makeFinding("fail"),
      makeFinding("info"),
      makeFinding("unknown"),
    ];

    expect(summarizeFindings(findings)).toEqual({
      total: 8,
      pass: 3,
      warning: 2,
      fail: 1,
      info: 1,
      unknown: 1,
    });
  });

  it("keeps unknown separate from pass and fail", () => {
    const result = summarizeFindings([makeFinding("unknown")]);
    expect(result.pass).toBe(0);
    expect(result.fail).toBe(0);
    expect(result.unknown).toBe(1);
  });
});