import { guardDashboardRequest, jsonResponse } from "@/lib/dashboard/guard";
import { getStore, LOCAL_OWNER_ID } from "@/lib/storage";

export const runtime = "nodejs";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const refused = guardDashboardRequest(request);
  if (refused) return refused;

  const { id } = await params;
  const removed = await getStore().removeDomain(LOCAL_OWNER_ID, id);
  return removed
    ? jsonResponse({ ok: true })
    : jsonResponse({ error: "Domain not found." }, 404);
}