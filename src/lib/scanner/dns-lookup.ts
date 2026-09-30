import { resolveTxt } from "node:dns/promises";

export type DnsQueryResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: "not-found" | "timeout" | "query-failed" };

const QUERY_TIMEOUT_MS = 5_000;

function withTimeout<T>(promise: Promise<T>): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("dns-timeout")), QUERY_TIMEOUT_MS),
    ),
  ]);
}

/**
 * Returns the "organizational domain" for SPF/DMARC purposes: a simplified
 * last-two-labels heuristic (e.g. "example.com" from "www.example.com").
 * This is NOT a correct Public Suffix List implementation, so it will be
 * wrong for domains like "example.co.uk". We accept that limitation for
 * now and say so in the relevant findings.
 */
export function getOrganizationalDomain(hostname: string): string {
  const labels = hostname.split(".");
  return labels.length <= 2 ? hostname : labels.slice(-2).join(".");
}

/** Queries all TXT records for a domain and returns them as joined strings. */
export async function queryTxtRecords(domain: string): Promise<DnsQueryResult<string[]>> {
  try {
    const records = await withTimeout(resolveTxt(domain));
    // Each TXT record can be split across multiple strings; DNS convention
    // is to concatenate them back into one value per record.
    const joined = records.map((chunks) => chunks.join(""));
    return joined.length === 0 ? { ok: false, reason: "not-found" } : { ok: true, value: joined };
  } catch (err) {
    if (err instanceof Error && err.message === "dns-timeout") {
      return { ok: false, reason: "timeout" };
    }
    const code = (err as NodeJS.ErrnoException)?.code;
    if (code === "ENOTFOUND" || code === "ENODATA") {
      return { ok: false, reason: "not-found" };
    }
    return { ok: false, reason: "query-failed" };
  }
}

/**
 * Checks DNSSEC status via Cloudflare's DNS-over-HTTPS resolver, reading
 * its "AD" (Authenticated Data) flag. This trusts Cloudflare's own DNSSEC
 * validation rather than independently verifying the cryptographic chain
 * of trust ourselves — Node's built-in dns module has no support at all
 * for the record types (DNSKEY/DS/RRSIG) real validation would require.
 */
export async function checkDnssec(domain: string): Promise<DnsQueryResult<boolean>> {
  const url = `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=DNSKEY`;

  let response: Response;
  try {
    response = await fetch(url, {
      headers: { Accept: "application/dns-json" },
      signal: AbortSignal.timeout(QUERY_TIMEOUT_MS),
    });
  } catch (err) {
    if (err instanceof Error && err.name === "TimeoutError") {
      return { ok: false, reason: "timeout" };
    }
    return { ok: false, reason: "query-failed" };
  }

  if (!response.ok) {
    return { ok: false, reason: "query-failed" };
  }

  let body: { Status?: number; AD?: boolean };
  try {
    body = await response.json();
  } catch {
    return { ok: false, reason: "query-failed" };
  }

  // Status 0 = NOERROR (a valid DNS response, whether or not records exist).
  // AD = true means Cloudflare's resolver cryptographically validated the
  // answer's DNSSEC signatures.
  if (body.Status !== 0) {
    return { ok: false, reason: "query-failed" };
  }

  return { ok: true, value: body.AD === true };
}