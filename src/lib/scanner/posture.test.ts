import { describe, it, expect } from "vitest";
import { evaluatePosture } from "./posture";
import type { Finding, Severity, Status } from "./types";

function makeFinding(status: Status, severity: Severity, id = "test"): Finding {
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

describe("evaluatePosture", () => {
  it("reports insufficient-data for an empty findings list", () => {
    expect(evaluatePosture([]).posture).toBe("insufficient-data");
  });

  it("reports insufficient-data when every finding is unknown", () => {
    const result = evaluatePosture([makeFinding("unknown", "info"), makeFinding("unknown", "info")]);
    expect(result.posture).toBe("insufficient-data");
  });

  it("reports good-configuration when there are only passes and info findings", () => {
    const result = evaluatePosture([
      makeFinding("pass", "info"),
      makeFinding("pass", "info"),
      makeFinding("info", "info"),
    ]);
    expect(result.posture).toBe("good-configuration");
  });

  it("is not swayed by a large number of passes alongside one real issue", () => {
    // This is the exact case the spec warns about: many passing checks
    // must never dilute a single meaningful failure into "mostly fine."
    const manyPasses = Array.from({ length: 20 }, (_, i) => makeFinding("pass", "info", `pass-${i}`));
    const result = evaluatePosture([...manyPasses, makeFinding("fail", "high", "the-one-issue")]);
    expect(result.posture).toBe("critical-issues");
    expect(result.drivenBy?.id).toBe("the-one-issue");
  });

  it("treats a single low-severity warning as needs-attention, not critical", () => {
    const result = evaluatePosture([makeFinding("pass", "info"), makeFinding("warning", "low")]);
    expect(result.posture).toBe("needs-attention");
  });

  it("treats a medium-severity fail as needs-attention", () => {
    const result = evaluatePosture([makeFinding("fail", "medium")]);
    expect(result.posture).toBe("needs-attention");
  });

  it("treats a high-severity fail as critical-issues", () => {
    const result = evaluatePosture([makeFinding("fail", "high")]);
    expect(result.posture).toBe("critical-issues");
  });

  it("treats a critical-severity warning as critical-issues", () => {
    const result = evaluatePosture([makeFinding("warning", "critical")]);
    expect(result.posture).toBe("critical-issues");
  });

  it("picks the single worst finding when several are actionable", () => {
    const low = makeFinding("warning", "low", "low-one");
    const high = makeFinding("fail", "high", "high-one");
    const medium = makeFinding("warning", "medium", "medium-one");
    const result = evaluatePosture([low, high, medium]);
    expect(result.drivenBy?.id).toBe("high-one");
  });

  it("never returns a posture label implying safety or trust", () => {
    const allPostureLabels = Object.values({
      empty: evaluatePosture([]).label,
      clean: evaluatePosture([makeFinding("pass", "info")]).label,
      bad: evaluatePosture([makeFinding("fail", "critical")]).label,
    });
    for (const label of allPostureLabels) {
      expect(label.toLowerCase()).not.toMatch(/\bsafe\b|\btrusted\b|\bverified\b|\bsecure\b/);
    }
  });
});