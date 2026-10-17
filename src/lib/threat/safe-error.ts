// Helpers for printing errors without leaking secrets.
//
// Why this exists: our private feed link contains a key, and a network error
// message can include the URL it was fetching. Build logs on a hosting
// platform are readable from a dashboard, so anything printed there should be
// treated as visible to others.

const SECRET_NAME = /(URL|KEY|TOKEN|SECRET|PASSWORD)$/i;
const MIN_SECRET_LENGTH = 8;

type Env = Record<string, string | undefined>;

export function redactSecrets(text: string, env: Env = process.env): string {
  let result = text;

  // 1. Known secret values, wherever they appear (even outside a URL).
  for (const [name, value] of Object.entries(env)) {
    if (!value || value.length < MIN_SECRET_LENGTH) continue;
    if (!SECRET_NAME.test(name)) continue;
    result = result.split(value).join("[redacted]");
  }

  // 2. Any URL at all. We never log full URLs, secret or not.
  result = result.replace(
    /\b[a-z][a-z0-9+.-]*:\/\/[^\s"'<>)\]]+/gi,
    "[url redacted]",
  );

  return result;
}

export function describeError(error: unknown, env: Env = process.env): string {
  // Anything that is not a real Error is not guessed at: it could be a string
  // that contains a secret.
  if (!(error instanceof Error)) return "Unknown error (details withheld).";

  let text = `${error.name}: ${error.message}`;

  // Network failures hide the useful part (ECONNRESET, ENOTFOUND...) in the
  // cause. That code is a short fixed string, so it is safe to show.
  const cause = (error as Error & { cause?: unknown }).cause;
  if (cause instanceof Error) {
    const code = (cause as Error & { code?: unknown }).code;
    if (typeof code === "string") text += ` (cause: ${code})`;
  }

  // The stack trace is deliberately left out.
  return redactSecrets(text, env);
}