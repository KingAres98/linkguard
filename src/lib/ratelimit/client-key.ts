const IP_CHARS = /^[0-9a-fA-F:.]{2,45}$/;

/**
 * Identifies the caller from ONE trusted header, named in configuration.
 * Without a configured header we cannot tell clients apart, because a plain
 * request carries no reliable address. The header is only trustworthy if
 * every request really passes through the proxy that sets it.
 *
 * If the header holds a comma-separated chain (X-Forwarded-For), the LAST
 * entry is the one our nearest proxy added; earlier ones are client-supplied.
 */
export function clientKeyFromRequest(request: Request, headerName: string | undefined): string {
  if (!headerName) return "unknown";

  let raw: string | null;
  try {
    raw = request.headers.get(headerName);
  } catch {
    return "unknown"; // an invalid header name in configuration
  }
  if (!raw) return "unknown";

  const candidate = raw.split(",").pop()?.trim() ?? "";
  if (!IP_CHARS.test(candidate) || !/[.:]/.test(candidate)) return "unknown";
  return candidate.toLowerCase();
}