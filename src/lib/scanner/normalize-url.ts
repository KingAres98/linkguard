export type NormalizeResult =
  | { ok: true; url: URL; schemeAssumed: boolean }
  | { ok: false; error: string };

const UNSUPPORTED_SCHEME = "Only http:// and https:// URLs can be scanned.";
const INVALID_URL = "That does not look like a valid URL.";

// "https://..." style: an explicit scheme followed by "://"
const HAS_EXPLICIT_SCHEME = /^[a-z][a-z0-9+.-]*:\/\//i;

// "javascript:alert(1)" or "mailto:a@b.com": a scheme-like prefix followed by
// a non-digit. "example.com:8080" is NOT matched, because a digit after the
// colon means host:port.
const OTHER_SCHEME = /^[a-z][a-z0-9+.-]*:(?!\d)/i;

/**
 * Turns raw user input into a parsed URL, or a fixed error message.
 * Error messages never echo the input back.
 */
export function normalizeUrl(input: string): NormalizeResult {
  let candidate = input;
  let schemeAssumed = false;

  if (!HAS_EXPLICIT_SCHEME.test(input)) {
    if (OTHER_SCHEME.test(input)) {
      return { ok: false, error: UNSUPPORTED_SCHEME };
    }
    candidate = `https://${input}`;
    schemeAssumed = true;
  }

  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    return { ok: false, error: INVALID_URL };
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { ok: false, error: UNSUPPORTED_SCHEME };
  }
  if (url.hostname === "") {
    return { ok: false, error: INVALID_URL };
  }

  return { ok: true, url, schemeAssumed };
}