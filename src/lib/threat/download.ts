export interface DownloadOptions {
  maxBytes: number;
  timeoutMs: number;
}

/**
 * Downloads a text file from a fixed URL. The response is untrusted, so it
 * is size-capped as it streams in (not after), and redirects are refused.
 */
export async function downloadText(url: string, options: DownloadOptions): Promise<string> {
  const response = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(options.timeoutMs),
    headers: { Accept: "text/plain" },
  });

  if (!response.ok) {
    throw new Error(`Download failed with HTTP ${response.status}.`);
  }

  const declared = Number(response.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > options.maxBytes) {
    throw new Error("Download is larger than the allowed size.");
  }

  if (!response.body) {
    throw new Error("Download had no body.");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > options.maxBytes) {
      await reader.cancel();
      throw new Error("Download is larger than the allowed size.");
    }
    chunks.push(value);
  }

  return new TextDecoder("utf-8").decode(Buffer.concat(chunks));
}