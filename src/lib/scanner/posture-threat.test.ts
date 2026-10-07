import { describe, expect, it } from "vitest";
import { evaluatePosture, POSTURE_LABELS } from "./posture";
import type { Finding } from "./types";

function finding(
  partial: Pick<Finding, "id" | "category" | "status" | "severity">,
): Finding {
  return {
    title: "t",
    description: "d",
    whyItMatters: "w",
    recommendation: "",
    evidence: [],
    confidence: "high",
    ...partial,
  };
}

const listed = finding({ id: "threat.listed", category: "threat", status: "fail", severity: "critical" });

describe("posture with threat findings", () => {
  it("labels a confirmed listing 'Known Threat Listing' and names it as the driver", () => {
    const result = evaluatePosture([finding({ id: "x", category: "url", status: "pass", severity: "info" }), listed]);
    expect(result.label).toBe("Known Threat Listing");
    expect(result.drivenBy?.id).toBe("threat.listed");
  });

  it("outranks other critical findings", () => {
    const other = finding({ id: "other", category: "tls", status: "fail", severity: "critical" });
    expect(evaluatePosture([other, listed]).label).toBe("Known Threat Listing");
  });

  it("does not change the posture when the target is simply not listed", () => {
    const notListed = finding({ id: "threat.not-listed", category: "threat", status: "info", severity: "info" });
    const pass = finding({ id: "x", category: "url", status: "pass", severity: "info" });
    expect(evaluatePosture([pass, notListed]).label).toBe("Good Configuration Observed");
  });

  it("does not change the posture when the feeds could not be checked", () => {
    const unavailable = finding({ id: "threat.unavailable", category: "threat", status: "unknown", severity: "info" });
    const pass = finding({ id: "x", category: "url", status: "pass", severity: "info" });
    expect(evaluatePosture([pass, unavailable]).label).toBe("Good Configuration Observed");
  });

  it("never uses a label that implies safety, for any posture", () => {
    for (const label of Object.values(POSTURE_LABELS)) {
      expect(label.toLowerCase()).not.toMatch(/\bsafe\b|\btrusted\b|\bverified\b|\bsecure\b/);
    }
  });
});