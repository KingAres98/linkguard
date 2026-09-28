import { SEVERITIES, type Finding, type Status } from "./types";

// Display order: things needing attention first, passes last.
const STATUS_ORDER: Status[] = ["fail", "warning", "unknown", "info", "pass"];

/** Returns a new sorted array. Does not modify the input. */
export function sortFindings(findings: Finding[]): Finding[] {
  return [...findings].sort((a, b) => {
    const byStatus = STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status);
    if (byStatus !== 0) return byStatus;
    // Higher severity first: "critical" has the highest index in SEVERITIES.
    return SEVERITIES.indexOf(b.severity) - SEVERITIES.indexOf(a.severity);
  });
}