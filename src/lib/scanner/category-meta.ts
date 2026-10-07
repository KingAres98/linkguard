import type { Category } from "./types";

export const CATEGORY_LABELS: Record<Category, string> = {
  threat: "Threat Intelligence",
  url: "URL",
  redirect: "Redirects",
  tls: "TLS / Certificate",
  headers: "Security Headers",
  dns: "DNS",
  email: "Email Authentication",
  domain: "Domain Information",
};

// Fixed display order, independent of whatever order findings happen to
// arrive in from the scanner. Threat listings come first because they
// outweigh configuration details.
export const CATEGORY_ORDER: Category[] = [
  "threat",
  "url",
  "redirect",
  "tls",
  "headers",
  "email",
  "dns",
  "domain",
];