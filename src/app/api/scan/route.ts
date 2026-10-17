import { clientKeyFromRequest } from "@/lib/ratelimit/client-key";
import { formatWait } from "@/lib/ratelimit/rate-limiter";
import { getScanProtection } from "@/lib/ratelimit/scan-protection";
import { normalizeUrl } from "@/lib/scanner/normalize-url";
import { runScan } from "@/lib/scanner/scan";
import { parseScanRequest } from "@/lib/scanner/validate-input";

// Our scanner needs Node's tls/dns modules, so pin the Node runtime.
export const runtime = "nodejs";

const MAX_BODY_BYTES = 4096;
const BASE_HEADERS = { "Cache-Control": "no-store" };

// Error responses use fixed messages and never echo the request back.
function errorResponse(
  status: number,
  message: string,
  extraHeaders: Record<string, string> = {},
): Response {
  return Response.json({ error: message }, { status, headers: { ...BASE_HEADERS, ...extraHeaders } });
}

function tooManyRequests(message: string, retryAfterSeconds: number): Response {
  return errorResponse(429, message, { "Retry-After": String(retryAfterSeconds) });
}

export async function POST(request: Request): Promise<Response> {
  const protection = getScanProtection();

  // 1. Per-client budget, before doing any work for this request.
  const client = clientKeyFromRequest(request, process.env.LINKGUARD_CLIENT_IP_HEADER);
  const clientCheck = protection.perClient.check(client);
  if (!clientCheck.allowed) {
    return tooManyRequests(
      `Too many scans from your network. Please wait about ${formatWait(clientCheck.retryAfterSeconds)} and try again.`,
      clientCheck.retryAfterSeconds,
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return errorResponse(415, "Requests must use Content-Type: application/json.");
  }

  // Cheap early rejection based on the declared size...
  const declaredLength = Number(request.headers.get("content-length"));
  if (Number.isFinite(declaredLength) && declaredLength > MAX_BODY_BYTES) {
    return errorResponse(413, "Request body is too large.");
  }

  // ...but the header can be missing or wrong, so check the real size too.
  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return errorResponse(413, "Request body is too large.");
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return errorResponse(400, "Request body must be valid JSON.");
  }

  const parsed = parseScanRequest(body);
  if (!parsed.ok) {
    return errorResponse(400, parsed.error);
  }

  // 2. Per-target budget: LinkGuard must not be usable to hammer one site.
  const normalized = normalizeUrl(parsed.url);
  if (normalized.ok) {
    const targetCheck = protection.perTarget.check(normalized.url.hostname.toLowerCase());
    if (!targetCheck.allowed) {
      return tooManyRequests(
        `That site was scanned very recently. Please wait about ${formatWait(targetCheck.retryAfterSeconds)} and try again.`,
        targetCheck.retryAfterSeconds,
      );
    }
  }

  // 3. Only a few scans may run at once.
  const release = protection.gate.tryEnter();
  if (!release) {
    return errorResponse(503, "LinkGuard is busy right now. Please try again in a few seconds.", {
      "Retry-After": "5",
    });
  }

  try {
    // Deliberately NOT logging parsed.url (may contain sensitive query strings).
    const result = await runScan(parsed.url);
    if (!result.ok) {
      return errorResponse(400, result.error);
    }
    return Response.json({ report: result.report }, { headers: BASE_HEADERS });
  } finally {
    release(); // always free the slot, even if the scan throws
  }
}