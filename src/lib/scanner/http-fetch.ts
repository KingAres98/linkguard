import http from "node:http";
import https from "node:https";

const DEFAULT_TIMEOUT_MS = 10_000;
const DEFAULT_MAX_RESPONSE_BYTES = 2_000_000; // 2 MB
const USER_AGENT = "LinkGuard/0.1 (+https://github.com/KingAres98/linkguard)";

export interface FetchOptions {
  timeoutMs?: number;
  maxResponseBytes?: number;
}

export type FetchOutcome =
  | { kind: "success"; status: number; headers: Record<string, string> }
  | { kind: "redirect"; status: number; location: string; headers: Record<string, string> }
  | { kind: "error"; reason: "timeout" | "too-large" | "network"; message: string };

/**
 * Builds a dns.lookup replacement that always answers with the IP we already
 * validated in ssrf-guard.ts, ignoring whatever DNS would say right now.
 * This is our defense against DNS rebinding: we checked one specific
 * address, so we must connect to that exact address, not to a fresh lookup
 * an attacker's DNS server could answer differently.
 *
 * Node's dns.LookupFunction type has several call-shape overloads for
 * historical reasons. We only implement the one shape Node's own http/https
 * modules actually use internally, so this is typed loosely on purpose.
 */
// Node's dns.LookupFunction type has several call-shape overloads; we
// implement all shapes Node's own http/https internals actually use, so
// this is typed loosely on purpose.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function makePinnedLookup(ip: string, family: 4 | 6): any {
  return (
    _hostname: string,
    options: unknown,
    callback?: (err: NodeJS.ErrnoException | null, address: unknown, family?: number) => void,
  ) => {
    // Legacy 2-argument form: (hostname, callback).
    if (typeof options === "function") {
      options(null, ip, family);
      return;
    }

    const wantsAll =
      typeof options === "object" && options !== null && (options as { all?: boolean }).all === true;

    if (wantsAll) {
      // When `all: true` is requested, Node expects an ARRAY of results,
      // not a single (address, family) pair. Passing a bare string here is
      // what caused "Invalid IP address: undefined".
      callback?.(null, [{ address: ip, family }]);
      return;
    }

    callback?.(null, ip, family);
  };
}

function normalizeHeaders(rawHeaders: http.IncomingHttpHeaders): Record<string, string> {
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(rawHeaders)) {
    if (typeof value === "string") headers[key] = value;
    else if (Array.isArray(value)) headers[key] = value.join(", ");
  }
  return headers;
}

/**
 * Makes exactly one HTTP request, connected to `pinnedIp` regardless of what
 * DNS says at request time. Does not follow redirects — it reports them so
 * the caller can decide, after re-validating the new target, whether to
 * follow. Enforces a timeout and a response-size cap so a hostile or broken
 * server cannot hang the scan or exhaust memory.
 */
export function fetchOnce(
  url: URL,
  pinnedIp: string,
  options: FetchOptions = {},
): Promise<FetchOutcome> {
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxResponseBytes = options.maxResponseBytes ?? DEFAULT_MAX_RESPONSE_BYTES;

  return new Promise((resolve) => {
    let settled = false;
    const settle = (outcome: FetchOutcome) => {
      if (settled) return;
      settled = true;
      resolve(outcome);
    };

    const transport = url.protocol === "https:" ? https : http;
    const family = pinnedIp.includes(":") ? 6 : 4;

        const request = transport.request(
      {
        hostname: url.hostname, // used for the Host header
        port: url.port || (url.protocol === "https:" ? 443 : 80),
        path: `${url.pathname}${url.search}`,
        method: "GET",
        lookup: makePinnedLookup(pinnedIp, family),
        // Without this, Node's TLS layer has no hostname to verify the
        // certificate against (it only sees the pinned IP), and the
        // handshake fails. servername restores correct SNI + cert
        // validation while the actual socket still connects to pinnedIp.
        servername: url.protocol === "https:" ? url.hostname : undefined,
        timeout: timeoutMs,
        headers: {
          "User-Agent": USER_AGENT,
          Accept: "text/html,application/xhtml+xml,*/*;q=0.8",
        },
      },
      (response) => {
        const status = response.statusCode ?? 0;
        const headers = normalizeHeaders(response.headers);
        const location = headers.location;

        if (status >= 300 && status < 400 && location) {
          response.resume(); // discard the body, we don't need it for a redirect
          settle({ kind: "redirect", status, location, headers });
          return;
        }

        let received = 0;
        response.on("data", (chunk: Buffer) => {
          received += chunk.length;
          if (received > maxResponseBytes) {
            request.destroy();
            settle({
              kind: "error",
              reason: "too-large",
              message: "The response exceeded the size limit and was stopped.",
            });
          }
        });
        response.on("end", () => {
          settle({ kind: "success", status, headers });
        });
        response.on("error", () => {
          settle({ kind: "error", reason: "network", message: "The response could not be read." });
        });
      },
    );

    request.on("timeout", () => {
      request.destroy();
      settle({ kind: "error", reason: "timeout", message: "The request timed out." });
    });

        request.on("error", (err) => {
      settle({ kind: "error", reason: "network", message: `The request could not be completed: ${err.message}` });
    });

    request.end();
  });
}