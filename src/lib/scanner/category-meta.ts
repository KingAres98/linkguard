import type { Category } from "./types";

export const CATEGORY_LABELS: Record<Category, string> = {
  url: "URL",
  redirect: "Redirects",
  tls: "TLS / Certificate",
  headers: "Security Headers",
  dns: "DNS",
  email: "Email Authentication",
  domain: "Domain Information",
};

// Fixed display order, independent of whatever order findings happen to
// arrive in from the scanner.
export const CATEGORY_ORDER: Category[] = [
  "url",
  "redirect",
  "tls",
  "headers",
  "email",
  "dns",
  "domain",
];