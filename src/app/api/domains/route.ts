import { guardDashboardRequest, jsonResponse } from "@/lib/dashboard/guard";
import { MAX_DOMAINS, parseDomainInput } from "@/lib/dashboard/parse-domain";
import { getStore, LOCAL_OWNER_ID } from "@/lib/storage";

export const runtime = "nodejs";

const MAX_BODY_BYTES = 1024;

export async function GET(request: Request): Promise<Response> {
  const refused = guardDashboardRequest(request);
  if (refused) return refused;

  const store = getStore();
  const domains = await store.listDomains(LOCAL_OWNER_ID);
  const withLatest = await Promise.all(
    domains.map(async (domain) => {
      const [latest] = await store.listScans(LOCAL_OWNER_ID, domain.id, 1);
      return {
        ...domain,
        latest: latest
          ? { scannedAt: latest.scannedAt, postureLabel: latest.postureLabel }
          : null,
      };
    }),
  );

  return jsonResponse({ domains: withLatest });
}

export async function POST(request: Request): Promise<Response> {
  const refused = guardDashboardRequest(request);
  if (refused) return refused;

  const contentType = request.headers.get("content-type") ?? "";
  if (!contentType.toLowerCase().startsWith("application/json")) {
    return jsonResponse({ error: "Requests must use Content-Type: application/json." }, 415);
  }

  const raw = await request.text();
  if (new TextEncoder().encode(raw).length > MAX_BODY_BYTES) {
    return jsonResponse({ error: "Request body is too large." }, 413);
  }

  let body: unknown;
  try {
    body = JSON.parse(raw);
  } catch {
    return jsonResponse({ error: "Request body must be valid JSON." }, 400);
  }

  const parsed = parseDomainInput(body);
  if (!parsed.ok) return jsonResponse({ error: parsed.error }, 400);

  const store = getStore();
  const existing = await store.listDomains(LOCAL_OWNER_ID);
  const alreadyTracked = existing.some((d) => d.hostname === parsed.hostname);

  if (!alreadyTracked && existing.length >= MAX_DOMAINS) {
    return jsonResponse({ error: `You can track at most ${MAX_DOMAINS} domains.` }, 409);
  }

  const domain = await store.addDomain(LOCAL_OWNER_ID, parsed.hostname);
  return jsonResponse({ domain }, alreadyTracked ? 200 : 201);
}