import { guardDashboardRequest, jsonResponse } from "@/lib/dashboard/guard";
import { getStore, LOCAL_OWNER_ID } from "@/lib/storage";

export const runtime = "nodejs";

const HISTORY_LIMIT = 20;

export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const refused = guardDashboardRequest(request);
  if (refused) return refused;

  const { id } = await params;
  const store = getStore();

  const domain = await store.getDomain(LOCAL_OWNER_ID, id);
  if (!domain) return jsonResponse({ error: "Domain not found." }, 404);

  const scans = await store.listScans(LOCAL_OWNER_ID, domain.id, HISTORY_LIMIT);
  return jsonResponse({ domain, scans });
}

/** Deletes a domain's saved scans but keeps the domain tracked. */
export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const refused = guardDashboardRequest(request);
  if (refused) return refused;

  const { id } = await params;
  const store = getStore();

  const domain = await store.getDomain(LOCAL_OWNER_ID, id);
  if (!domain) return jsonResponse({ error: "Domain not found." }, 404);

  const removed = await store.clearScans(LOCAL_OWNER_ID, domain.id);
  return jsonResponse({ ok: true, removed });
}