export function jsonResponse(body: unknown, status = 200): Response {
  return Response.json(body, { status, headers: { "Cache-Control": "no-store" } });
}

/**
 * Returns a Response if the request must be refused, or null to continue.
 * Every dashboard route calls this first.
 */
export function guardDashboardRequest(request: Request): Response | null {
  if (process.env.LINKGUARD_DASHBOARD_ENABLED !== "true") {
    return jsonResponse({ error: "Not found." }, 404);
  }

  // Browsers tell us who initiated the request. "same-origin" is our own
  // page, "none" is a direct navigation. Anything else came from another site.
  // Non-browser clients send no header at all, which we allow.
  const site = request.headers.get("sec-fetch-site");
  if (site !== null && site !== "same-origin" && site !== "none") {
    return jsonResponse({ error: "Cross-site requests are not allowed." }, 403);
  }

  return null;
}