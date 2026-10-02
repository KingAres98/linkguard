/**
 * Shared types for LinkGuard findings.
 *
 * Every checker returns Finding[]. The report UI and posture evaluation
 * only ever consume these types, never checker-specific data.
 */

// `as const` arrays give us both a runtime list (for validation/sorting)
// and a union type derived from the same source of truth.

export const SEVERITIES = [
  "info",
  "low",
  "medium",
  "high",
  "critical",
] as const;
export type Severity = (typeof SEVERITIES)[number];

export const STATUSES = ["pass", "warning", "fail", "info", "unknown"] as const;
export type Status = (typeof STATUSES)[number];

export const CATEGORIES = [
  "url",
  "redirect",
  "tls",
  "headers",
  "dns",
  "email",
  "domain",
] as const;
export type Category = (typeof CATEGORIES)[number];

export const CONFIDENCES = ["low", "medium", "high"] as const;
export type Confidence = (typeof CONFIDENCES)[number];

/** One piece of technical evidence, e.g. { label: "Header", value: "(absent)" } */
export interface EvidenceItem {
  label: string;
  value: string;
}

export interface Finding {
  /** Stable machine-readable ID, e.g. "headers.hsts.missing" */
  id: string;
  category: Category;
  /** What we OBSERVED: pass, warning, fail, info, or unknown (could not check) */
  status: Status;
  /** How much it matters IF it is a real issue. Passing checks use "info". */
  severity: Severity;
  title: string;
  /** What we found: a factual description of the observation */
  description: string;
  /** Why it matters, in plain language for a normal user */
  whyItMatters: string;
  /** A practical remediation step (may be empty for passing checks) */
  recommendation: string;
  /** The raw technical facts that produced this finding */
  evidence: EvidenceItem[];
  /** How sure we are that this finding is accurate */
  confidence: Confidence;
  /** What we cannot conclude from this evidence */
  limitations?: string;
}

/** The output of one scan: a target plus its findings. */
export interface ScanReport {
  target: string;
  scannedAt: string; // ISO 8601 timestamp
  findings: Finding[];
  posture: {
    label: string;
    drivenByFindingId?: string;
  };
}