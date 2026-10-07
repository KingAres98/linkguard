/** One place where a scanned hostname appeared in a threat feed. */
export interface ThreatMatch {
  /** Which feed listed it, such as "phishing-database". */
  source: string;
  /** The listed entry that matched: the host itself or one of its parent domains. */
  matchedHost: string;
}

export interface SourceStatus {
  source: string;
  updatedAt: string; // ISO 8601
  entryCount: number;
}

/**
 * Like ScanStore, this hides the database behind an interface so the
 * storage can change later without touching the code that uses it.
 */
export interface ThreatIndex {
  /** Matches the host and its parent domains, up to the registrable domain. */
  lookup(hostname: string): Promise<ThreatMatch[]>;
  getStatus(): Promise<SourceStatus[]>;
  /** Atomically replaces everything from one source. */
  replaceSource(source: string, hosts: readonly string[], updatedAt: string): Promise<void>;
}