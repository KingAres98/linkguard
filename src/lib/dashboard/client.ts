export type ApiResult<T> = { ok: true; data: T } | { ok: false; error: string };

const DEFAULT_TIMEOUT_MS = 15000;

/**
 * Calls one of our own API routes and never throws. Failures come back as
 * a plain error string that is safe to show on screen.
 */
export async function requestJson<T>(
  path: string,
  init: RequestInit = {},
  timeoutMs: number = DEFAULT_TIMEOUT_MS,
): Promise<ApiResult<T>> {
  try {
    const response = await fetch(path, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    const body = (await response.json().catch(() => null)) as Record<string, unknown> | null;

    if (!response.ok) {
      const message =
        body && typeof body.error === "string"
          ? body.error
          : "The request failed. Please try again.";
      return { ok: false, error: message };
    }

    if (body === null) {
      return { ok: false, error: "Unexpected response from the server." };
    }

    return { ok: true, data: body as T };
  } catch {
    return { ok: false, error: "Could not reach the server. Check your connection and try again." };
  }
}