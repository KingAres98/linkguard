import { lookup } from "node:dns/promises";
import { classifyIp, type BlockReason } from "./ip-classify";

export type SafeUrlResult =
  | { safe: true; resolvedIps: string[] }
  | { safe: false; reason: BlockReason | "dns-failed" | "no-addresses" };

/**
 * Resolves a hostname to IP addresses and confirms every one of them is
 * safe to connect to. This must run again for EVERY redirect hop, because
 * the destination host changes each time, and because DNS can answer
 * differently between checks (rebinding).
 */
export async function resolveAndValidateHost(hostname: string): Promise<SafeUrlResult> {
  // A literal IP in the URL (e.g. http://127.0.0.1) skips DNS entirely.
  const bareHost = hostname.replace(/^\[|\]$/g, "");
  if (isValidLiteralIp(bareHost)) {
    const direct = classifyIp(bareHost);
    return direct.blocked
      ? { safe: false, reason: direct.reason }
      : { safe: true, resolvedIps: [bareHost] };
  }

  let addresses: { address: string }[];
  try {
    // { all: true } returns every A/AAAA record, since we must check ALL of
    // them: an attacker-controlled DNS server could return one safe address
    // and one private one, hoping only the first gets checked.
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    return { safe: false, reason: "dns-failed" };
  }

  if (addresses.length === 0) {
    return { safe: false, reason: "no-addresses" };
  }

  for (const { address } of addresses) {
    const result = classifyIp(address);
    if (result.blocked) {
      return { safe: false, reason: result.reason };
    }
  }

  return { safe: true, resolvedIps: addresses.map((a) => a.address) };
}

function isValidLiteralIp(host: string): boolean {
  // A crude check just to decide whether to skip DNS. classifyIp() does the
  // real validation either way, so a false negative here just means we
  // attempt (and safely fail) a DNS lookup on a literal IP.
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host) || host.includes(":");
}