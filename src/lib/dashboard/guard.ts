export function isDashboardEnabled(): boolean {
  return process.env.LINKGUARD_DASHBOARD_ENABLED === "true";
}

export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

export function guardDashboardRequest(request: Request): Response | null {
  if (!isDashboardEnabled()) {
    return jsonResponse({ error: "Not found." }, 404);
  }

  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") {
    return jsonResponse({ error: "Cross-site requests are not allowed." }, 403);
  }

  return null;
}