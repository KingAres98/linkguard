import { guardDashboardRequest, jsonResponse } from "@/lib/dashboard/guard";
import { runScan } from "@/lib/scanner/scan";
import { getStore, LOCAL_OWNER_ID } from "@/lib/storage";

export const runtime = "nodejs";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const refused = guardDashboardRequest(request);
  if (refused) return refused;

  const { id } = await params;
  const store = getStore();

  const domain = await store.getDomain(LOCAL_OWNER_ID, id);
  if (!domain) return jsonResponse({ error: "Domain not found." }, 404);

  // The same guarded pipeline as the public scanner, SSRF checks included.
  const result = await runScan(domain.hostname);
  if (!result.ok) return jsonResponse({ error: result.error }, 400);

  const scan = await store.saveScan(LOCAL_OWNER_ID, domain.id, result.report);
  return jsonResponse({ scan }, 201);
}