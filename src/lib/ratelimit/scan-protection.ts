import { ConcurrencyGate } from "./concurrency-gate";
import { FixedWindowLimiter } from "./rate-limiter";

export const SCAN_LIMITS = {
  clientLimit: 30,
  clientWindowMs: 10 * 60_000,
  targetLimit: 6,
  targetWindowMs: 60_000,
  maxConcurrent: 4,
} as const;

export interface ScanProtection {
  perClient: FixedWindowLimiter;
  perTarget: FixedWindowLimiter;
  gate: ConcurrencyGate;
}

function create(): ScanProtection {
  return {
    perClient: new FixedWindowLimiter({
      limit: SCAN_LIMITS.clientLimit,
      windowMs: SCAN_LIMITS.clientWindowMs,
    }),
    perTarget: new FixedWindowLimiter({
      limit: SCAN_LIMITS.targetLimit,
      windowMs: SCAN_LIMITS.targetWindowMs,
    }),
    gate: new ConcurrencyGate(SCAN_LIMITS.maxConcurrent),
  };
}

let current: ScanProtection | null = null;

/** One shared set of counters per server process. */
export function getScanProtection(): ScanProtection {
  return (current ??= create());
}

export function setScanProtectionForTesting(protection: ScanProtection | null): void {
  current = protection;
}