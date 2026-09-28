import { isIP } from "node:net";

export type BlockReason =
  | "loopback"
  | "private"
  | "link-local"
  | "cloud-metadata"
  | "unspecified"
  | "multicast"
  | "reserved";

export type IpClassification =
  | { blocked: false }
  | { blocked: true; reason: BlockReason };

/** AWS/GCP/Azure/DigitalOcean all use this single address for instance metadata. */
const CLOUD_METADATA_IPV4 = "169.254.169.254";

// Each range is checked with plain integer math (below), not a regex,
// because CIDR math on strings is easy to get subtly wrong.
const IPV4_BLOCKED_RANGES: Array<{ base: string; bits: number; reason: BlockReason }> = [
  { base: "127.0.0.0", bits: 8, reason: "loopback" }, // 127.0.0.0/8
  { base: "10.0.0.0", bits: 8, reason: "private" }, // 10.0.0.0/8
  { base: "172.16.0.0", bits: 12, reason: "private" }, // 172.16.0.0/12
  { base: "192.168.0.0", bits: 16, reason: "private" }, // 192.168.0.0/16
  { base: "169.254.0.0", bits: 16, reason: "link-local" }, // 169.254.0.0/16 (covers metadata too)
  { base: "0.0.0.0", bits: 8, reason: "unspecified" }, // 0.0.0.0/8
  { base: "100.64.0.0", bits: 10, reason: "private" }, // 100.64.0.0/10, carrier-grade NAT
  { base: "224.0.0.0", bits: 4, reason: "multicast" }, // 224.0.0.0/4
  { base: "240.0.0.0", bits: 4, reason: "reserved" }, // 240.0.0.0/4
];

function ipv4ToInt(ip: string): number {
  const parts = ip.split(".").map(Number);
  return parts.reduce((acc, part) => acc * 256 + part, 0);
}

function isInIpv4Range(ip: string, base: string, bits: number): boolean {
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipv4ToInt(ip) & mask) === (ipv4ToInt(base) & mask);
}

function classifyIpv4(ip: string): IpClassification {
  if (ip === CLOUD_METADATA_IPV4) return { blocked: true, reason: "cloud-metadata" };
  for (const range of IPV4_BLOCKED_RANGES) {
    if (isInIpv4Range(ip, range.base, range.bits)) {
      return { blocked: true, reason: range.reason };
    }
  }
  return { blocked: false };
}

/** Expands "::" and returns 8 groups as numbers, or null if malformed. */
function expandIpv6(ip: string): number[] | null {
  const clean = ip.replace(/^\[|\]$/g, "");
  const [head, tail = ""] = clean.split("::");
  const headParts = head ? head.split(":") : [];
  const tailParts = tail ? tail.split(":") : [];

  if (!clean.includes("::") && headParts.length !== 8) return null;
  const missing = 8 - headParts.length - tailParts.length;
  if (missing < 0) return null;

  const allParts = [...headParts, ...Array(missing).fill("0"), ...tailParts];
  if (allParts.length !== 8) return null;

  const groups = allParts.map((part) => parseInt(part || "0", 16));
  return groups.some(Number.isNaN) ? null : groups;
}

// ::ffff:a.b.c.d is an IPv4 address embedded in IPv6 notation. Match it
// directly rather than trying to hex-parse the dotted-quad part.
const IPV4_MAPPED_PATTERN = /^::ffff:(\d{1,3}(?:\.\d{1,3}){3})$/i;

function classifyIpv6(ip: string): IpClassification {
  const mapped = ip.match(IPV4_MAPPED_PATTERN);
  if (mapped) {
    return classifyIpv4(mapped[1]);
  }

  const groups = expandIpv6(ip);
  if (!groups) return { blocked: false };

  const isAllZero = (count: number) => groups.slice(0, count).every((g) => g === 0);

  if (isAllZero(8)) return { blocked: true, reason: "unspecified" }; // ::
  if (isAllZero(7) && groups[7] === 1) return { blocked: true, reason: "loopback" }; // ::1
  if (groups[0] === 0xfe80) return { blocked: true, reason: "link-local" }; // fe80::/10 (simplified)
  if (groups[0] >= 0xfc00 && groups[0] <= 0xfdff) return { blocked: true, reason: "private" }; // fc00::/7, ULA
  // ::ffff:a.b.c.d : an IPv4 address mapped into IPv6. Rebinding can hide an
  // internal IPv4 address this way, so unwrap it and classify the IPv4 form.
  if (isAllZero(5) && groups[5] === 0xffff) {
    const ipv4 = `${groups[6] >> 8}.${groups[6] & 0xff}.${groups[7] >> 8}.${groups[7] & 0xff}`;
    return classifyIpv4(ipv4);
  }

  return { blocked: false };
}

/** Classifies a single IP address (already resolved, not a hostname). */
export function classifyIp(ip: string): IpClassification {
  const version = isIP(ip);
  if (version === 4) return classifyIpv4(ip);
  if (version === 6) return classifyIpv6(ip);
  // Not a recognizable IP at all: treat as blocked rather than guess.
  return { blocked: true, reason: "reserved" };
}