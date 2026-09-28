export const MAX_URL_LENGTH = 2048;

export type ParseResult =
  | { ok: true; url: string }
  | { ok: false; error: string };

/** True if the string contains ASCII control characters (0-31 or 127). */
function hasControlCharacters(value: string): boolean {
  for (let i = 0; i < value.length; i++) {
    const code = value.charCodeAt(i);
    if (code <= 31 || code === 127) return true;
  }
  return false;
}

/**
 * Validates the parsed JSON body of a scan request.
 * `body` is typed `unknown` on purpose: we make no assumptions about it.
 * Note: this checks the *shape* of the input only. URL parsing and
 * SSRF protection come in later steps.
 */
export function parseScanRequest(body: unknown): ParseResult {
  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return { ok: false, error: "Request body must be a JSON object." };
  }

  const candidate = (body as Record<string, unknown>).url;

  if (typeof candidate !== "string") {
    return { ok: false, error: "The 'url' field must be a string." };
  }

  const url = candidate.trim();

  if (url.length === 0) {
    return { ok: false, error: "Enter a URL to scan." };
  }
  if (url.length > MAX_URL_LENGTH) {
    return {
      ok: false,
      error: `That URL is too long (maximum ${MAX_URL_LENGTH} characters).`,
    };
  }
  if (hasControlCharacters(url)) {
    return { ok: false, error: "The URL contains invalid characters." };
  }

  return { ok: true, url };
}