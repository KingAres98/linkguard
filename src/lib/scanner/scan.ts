import { analyzeUrl } from "./checkers/url-checker";
import { normalizeUrl } from "./normalize-url";
import type { ScanReport } from "./types";

export type ScanResult =
  | { ok: true; report: ScanReport }
  | { ok: false; error: string };

/** The URL we show back to the user: same address, minus embedded credentials. */
function toDisplayTarget(url: URL): string {
  const copy = new URL(url.href);
  copy.username = "";
  copy.password = "";
  return copy.href;
}

export async function runScan(input: string): Promise<ScanResult> {
  const normalized = normalizeUrl(input);
  if (!normalized.ok) {
    return { ok: false, error: normalized.error };
  }

  return {
    ok: true,
    report: {
      target: toDisplayTarget(normalized.url),
      scannedAt: new Date().toISOString(),
      findings: analyzeUrl(normalized),
    },
  };
}