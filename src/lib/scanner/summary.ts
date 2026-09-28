import type { Finding, Status } from "./types";

export interface ReportSummary {
  total: number;
  pass: number;
  warning: number;
  fail: number;
  info: number;
  unknown: number;
}

/**
 * Count findings by status. This is a description of what was observed,
 * not a safety verdict: there is deliberately no "score" or "safe" output.
 */
export function summarizeFindings(findings: Finding[]): ReportSummary {
  const summary: ReportSummary = {
    total: findings.length,
    pass: 0,
    warning: 0,
    fail: 0,
    info: 0,
    unknown: 0,
  };

  for (const finding of findings) {
    const status: Status = finding.status;
    summary[status] += 1;
  }

  return summary;
}