export interface SecurityHeader {
  key: string;
  value: string;
}

/**
 * Content Security Policy. Everything must come from our own origin.
 *
 * script-src needs 'unsafe-inline' because Next.js emits small inline scripts
 * for hydration; a nonce-based policy would be stricter but needs per-request
 * code. In development only, React refresh needs 'unsafe-eval' and the hot
 * reload socket needs ws:.
 */
export function buildCsp(production: boolean): string {
  const directives = [
    "default-src 'self'",
    `script-src 'self' 'unsafe-inline'${production ? "" : " 'unsafe-eval'"}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self'${production ? "" : " ws: wss:"}`,
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ];
  if (production) directives.push("upgrade-insecure-requests");
  return directives.join("; ");
}

export function buildSecurityHeaders(production: boolean): SecurityHeader[] {
  const headers: SecurityHeader[] = [
    { key: "Content-Security-Policy", value: buildCsp(production) },
    { key: "X-Content-Type-Options", value: "nosniff" },
    { key: "X-Frame-Options", value: "DENY" },
    { key: "Referrer-Policy", value: "no-referrer" },
    {
      key: "Permissions-Policy",
      value: "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
    },
    { key: "Cross-Origin-Opener-Policy", value: "same-origin" },
    { key: "Cross-Origin-Resource-Policy", value: "same-origin" },
  ];

  // Browsers ignore HSTS over plain http, so it only belongs in production.
  // No includeSubDomains: we do not control every subdomain of the host.
  if (production) {
    headers.push({ key: "Strict-Transport-Security", value: "max-age=31536000" });
  }

  return headers;
}