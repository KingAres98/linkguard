export interface LimitResult {
  allowed: boolean;
  remaining: number;
  retryAfterSeconds: number;
}

export interface LimiterOptions {
  limit: number;
  windowMs: number;
  /** Hard cap on tracked keys so memory cannot grow without bound. */
  maxKeys?: number;
}

/**
 * Fixed-window counter: each key gets `limit` requests per `windowMs`.
 * In-memory, so it covers one server process. The clock is a parameter so
 * tests can control time.
 */
export class FixedWindowLimiter {
  private entries = new Map<string, { count: number; resetAt: number }>();
  private lastSweep = 0;
  private readonly maxKeys: number;

  constructor(private readonly options: LimiterOptions) {
    this.maxKeys = options.maxKeys ?? 10_000;
  }

  get size(): number {
    return this.entries.size;
  }

  check(key: string, now: number = Date.now()): LimitResult {
    let entry = this.entries.get(key);
    if (!entry || entry.resetAt <= now) {
      this.makeRoom(now);
      entry = { count: 0, resetAt: now + this.options.windowMs };
      this.entries.set(key, entry);
    }

    if (entry.count >= this.options.limit) {
      return {
        allowed: false,
        remaining: 0,
        retryAfterSeconds: Math.max(1, Math.ceil((entry.resetAt - now) / 1000)),
      };
    }

    entry.count++;
    return { allowed: true, remaining: this.options.limit - entry.count, retryAfterSeconds: 0 };
  }

  private makeRoom(now: number): void {
    if (this.entries.size < this.maxKeys) return;

    // Sweep expired entries, at most once a second.
    if (now - this.lastSweep >= 1000) {
      this.lastSweep = now;
      for (const [key, entry] of this.entries) {
        if (entry.resetAt <= now) this.entries.delete(key);
      }
    }

    // Still full: drop the oldest entry.
    if (this.entries.size >= this.maxKeys) {
      const oldest = this.entries.keys().next().value;
      if (oldest !== undefined) this.entries.delete(oldest);
    }
  }
}

/** "1 second", "45 seconds", "10 minutes": wording for the "please wait" message. */
export function formatWait(seconds: number): string {
  if (seconds < 90) return `${seconds} second${seconds === 1 ? "" : "s"}`;
  return `${Math.ceil(seconds / 60)} minutes`;
}