import type { Finding, Severity } from "./types";

export const POSTURES = [
  "known-threat",
  "critical-issues",
  "needs-attention",
  "minor-notes",
  "good-configuration",
  "insufficient-data",
] as const;
export type Posture = (typeof POSTURES)[number];

export interface PostureResult {
  posture: Posture;
  label: string;
  /** The single most severe finding that drove this posture, if any. */
  drivenBy?: Finding;
}

export const POSTURE_LABELS: Record<Posture, string> = {
  "known-threat": "Known Threat Listing",
  "critical-issues": "Critical Issues Found",
  "needs-attention": "Needs Attention",
  "minor-notes": "Good Configuration — Minor Notes",
  "good-configuration": "Good Configuration Observed",
  "insufficient-data": "Insufficient Data",
};

// Only fail/warning findings can drive posture. A "pass" or "info" finding,
// however many there are, never lowers the posture on its own — this is
// what stops a percentage-style "80% passed" score from sneaking back in.
const SEVERITY_RANK: Record<Severity, number> = {
  critical: 4,
  high: 3,
  medium: 2,
  low: 1,
  info: 0,
};

/**
 * Determines an overall posture label from the WORST relevant finding,
 * never an average or percentage. This label describes observed
 * configuration state, not a safety verdict. Callers must always display
 * it alongside a fixed disclaimer (see ReportView), never alone.
 */
export function evaluatePosture(findings: Finding[]): PostureResult {
  const actionable = findings.filter((f) => f.status === "fail" || f.status === "warning");

  if (findings.length === 0) {
    return { posture: "insufficient-data", label: POSTURE_LABELS["insufficient-data"] };
  }

  const allUnknown = findings.every((f) => f.status === "unknown");
  if (allUnknown) {
    return { posture: "insufficient-data", label: POSTURE_LABELS["insufficient-data"] };
  }

  // A confirmed threat-feed listing outranks every configuration finding.
  const listed = findings.find((f) => f.category === "threat" && f.status === "fail");
  if (listed) {
    return { posture: "known-threat", label: POSTURE_LABELS["known-threat"], drivenBy: listed };
  }

  if (actionable.length === 0) {
    return { posture: "good-configuration", label: POSTURE_LABELS["good-configuration"] };
  }

  const worst = actionable.reduce((worstSoFar, current) =>
    SEVERITY_RANK[current.severity] > SEVERITY_RANK[worstSoFar.severity] ? current : worstSoFar,
  );

  let posture: Posture;
  if (worst.severity === "critical" || worst.severity === "high") {
    posture = "critical-issues";
  } else if (worst.severity === "medium") {
    posture = "needs-attention";
  } else {
    // worst.severity === "low" here. This finding is 100% real and still
    // shown in full below — this only affects how the OVERALL label reads,
    // so a single minor gap doesn't carry the same weight as a medium or
    // high-severity issue.
    posture = "minor-notes";
  }

  return { posture, label: POSTURE_LABELS[posture], drivenBy: worst };
}