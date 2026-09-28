import { runScan } from "@/lib/scanner/scan";
import { parseScanRequest } from "@/lib/scanner/validate-input";

// Our scanner will need Node's tls/dns modules later, so pin the Node runtime.
export const runtime = "nodejs";

const MAX_BODY_BYTES = 4096;
const BASE_HEADERS = { "Cache-Control": "no-store" };

// Error responses use fixed messages and never echo the request back.
function errorResponse(status: number, message: string): Response {
  return Response.json({ error: message }, { status, headers: BASE_HEADERS });
}

export async function POST(request: Request): Promise<Response> {
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

    // Deliberately NOT logging parsed.url (may contain sensitive query strings).
  const result = await runScan(parsed.url);
  if (!result.ok) {
    return errorResponse(400, result.error);
  }

  return Response.json({ report: result.report }, { headers: BASE_HEADERS });
}