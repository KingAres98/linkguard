import tls from "node:tls";

export interface CertificateInfo {
  subjectCN: string | null;
  issuerCN: string | null;
  issuerOrg: string | null;
  validFrom: string; // ISO 8601
  validTo: string; // ISO 8601
  daysUntilExpiry: number;
  isExpired: boolean;
  isNotYetValid: boolean;
  hostnameMatches: boolean;
  subjectAltNames: string[];
}

export type TlsInspectResult =
  | { ok: true; certificate: CertificateInfo }
  | { ok: false; reason: "timeout" | "handshake-failed" | "no-certificate" };

const DEFAULT_TIMEOUT_MS = 8_000;

/**
 * Certificate subject/issuer fields like CN and O are technically allowed
 * to repeat in X.509, so Node types them as `string | string[]`. We collapse
 * that down to a single display string.
 */
function toSingleString(value: string | string[] | undefined): string | null {
  if (value === undefined) return null;
  return Array.isArray(value) ? value.join(", ") : value;
}

/** Splits a comma-separated SAN string like "DNS:a.com, DNS:*.b.com" into names. */
function parseSubjectAltNames(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw
    .split(",")
    .map((entry) => entry.trim().replace(/^DNS:/i, ""))
    .filter((entry) => entry.length > 0);
}

/**
 * Opens a TLS connection to `pinnedIp` (never re-resolving the hostname,
 * for the same DNS-rebinding reasons as http-fetch.ts) and inspects the
 * certificate the server presents. Makes no HTTP request; this is a
 * TLS-layer check only.
 */
export function inspectCertificate(
  hostname: string,
  pinnedIp: string,
  port: number,
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<TlsInspectResult> {
  return new Promise((resolve) => {
    let settled = false;
    const settle = (result: TlsInspectResult) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve(result);
    };

    const socket = tls.connect({
      host: pinnedIp, // connect to the pinned IP, never re-resolving the hostname
      port,
      servername: hostname, // SNI + the name Node checks the cert against
      timeout: timeoutMs,
      // We inspect the certificate ourselves and report on it as a finding
      // rather than letting a mismatch throw; this must be false so we can
      // see and report invalid/mismatched certs rather than only ever
      // seeing a connection failure.
      rejectUnauthorized: false,
    });

    socket.on("secureConnect", () => {
      const cert = socket.getPeerCertificate();

      if (!cert || Object.keys(cert).length === 0) {
        settle({ ok: false, reason: "no-certificate" });
        return;
      }

      const validFrom = new Date(cert.valid_from);
      const validTo = new Date(cert.valid_to);
      const now = new Date();
      const daysUntilExpiry = Math.round((validTo.getTime() - now.getTime()) / 86_400_000);

      settle({
        ok: true,
        certificate: {
          subjectCN: toSingleString(cert.subject?.CN),
          issuerCN: toSingleString(cert.issuer?.CN),
          issuerOrg: toSingleString(cert.issuer?.O),
          validFrom: validFrom.toISOString(),
          validTo: validTo.toISOString(),
          daysUntilExpiry,
          isExpired: now > validTo,
          isNotYetValid: now < validFrom,
          hostnameMatches: checkHostnameManually(hostname, cert),
          subjectAltNames: parseSubjectAltNames(cert.subjectaltname),
        },
      });
    });

    socket.on("timeout", () => settle({ ok: false, reason: "timeout" }));
    socket.on("error", () => settle({ ok: false, reason: "handshake-failed" }));
  });
}

/**
 * Node's tls.checkServerIdentity does this same job internally, but only
 * throws/doesn't throw; it does not hand back a reusable boolean. We
 * re-implement the same check explicitly so we can report the result
 * as a finding either way, rather than only detecting a mismatch via
 * a thrown error.
 */
function checkHostnameManually(hostname: string, cert: tls.PeerCertificate): boolean {
  const error = tls.checkServerIdentity(hostname, cert);
  return error === undefined;
}