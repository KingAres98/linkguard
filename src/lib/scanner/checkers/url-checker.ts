import { domainToUnicode } from "node:url";
import type { Finding } from "../types";

export interface UrlAnalysisInput {
  url: URL;
  schemeAssumed: boolean;
}

const IPV4_PATTERN = /^\d{1,3}(\.\d{1,3}){3}$/;
const DOUBLE_ENCODING_PATTERN = /%25[0-9a-f]{2}/i;
const MANY_SUBDOMAINS_THRESHOLD = 5;
const MAX_EVIDENCE_LENGTH = 200;

/** Evidence comes from user-supplied text, so keep it bounded. */
function clip(value: string): string {
  return value.length > MAX_EVIDENCE_LENGTH
    ? `${value.slice(0, MAX_EVIDENCE_LENGTH)}…`
    : value;
}

// After parsing, IPv4 hosts are canonical dotted quads and IPv6 hosts
// are wrapped in square brackets.
function isIpHost(hostname: string): boolean {
  return IPV4_PATTERN.test(hostname) || hostname.startsWith("[");
}

function checkSyntax(url: URL): Finding {
  return {
    id: "url.syntax.valid",
    category: "url",
    status: "pass",
    severity: "info",
    title: "URL is well-formed",
    description: "The input was parsed as a valid http(s) URL.",
    whyItMatters:
      "A URL that parses cleanly can be analyzed reliably. Malformed URLs are harder to interpret and are sometimes used to confuse filters.",
    recommendation: "",
    evidence: [
      { label: "Scheme", value: url.protocol.replace(":", "") },
      { label: "Host", value: clip(url.hostname) },
    ],
    confidence: "high",
    limitations: "Being well-formed says nothing about whether the destination is trustworthy.",
  };
}

function checkScheme({ url, schemeAssumed }: UrlAnalysisInput): Finding {
  const scheme = url.protocol.replace(":", "");

  // If WE chose https, we did not observe it, so we say that instead of
  // reporting a pass.
  if (schemeAssumed) {
    return {
      id: "url.scheme.assumed",
      category: "url",
      status: "info",
      severity: "info",
      title: "No scheme entered, https:// assumed",
      description: "The input had no http:// or https:// prefix, so https:// was assumed.",
      whyItMatters:
        "LinkGuard cannot tell from this input whether the site is reachable over HTTPS. That is checked in a later phase.",
      recommendation: "",
      evidence: [{ label: "Assumed scheme", value: "https" }],
      confidence: "high",
    };
  }

  if (scheme === "https") {
    return {
      id: "url.https.enabled",
      category: "url",
      status: "pass",
      severity: "info",
      title: "URL uses HTTPS",
      description: "The URL uses the https:// scheme.",
      whyItMatters:
        "HTTPS encrypts traffic between your browser and the server, so others on the network cannot easily read or alter it.",
      recommendation: "",
      evidence: [{ label: "Scheme", value: "https" }],
      confidence: "high",
      limitations:
        "HTTPS protects the connection in transit. It does not indicate who runs the site or whether it is trustworthy.",
    };
  }

  return {
    id: "url.https.missing",
    category: "url",
    status: "warning",
    severity: "low",
    title: "URL uses plain HTTP",
    description: "The URL uses the http:// scheme, which is not encrypted.",
    whyItMatters:
      "Anything sent over plain HTTP can be read or modified by others on the network path.",
    recommendation:
      "Use the https:// address if the site offers one. Site owners should serve the site over HTTPS and redirect HTTP requests to it.",
    evidence: [{ label: "Scheme", value: "http" }],
    confidence: "high",
    limitations:
      "The server may redirect HTTP to HTTPS. Redirect analysis (a later phase) will check that.",
  };
}

function checkIpHost(url: URL): Finding | null {
  if (!isIpHost(url.hostname)) return null;
  return {
    id: "url.host.ip-address",
    category: "url",
    status: "warning",
    severity: "low",
    title: "URL uses an IP address instead of a domain name",
    description: "The host is a raw IP address rather than a domain name.",
    whyItMatters:
      "Public websites almost always use domain names. IP-address links are common in phishing and malware campaigns because they hide who operates the site, but they are also used for routers, internal tools, and test servers.",
    recommendation:
      "Be cautious with IP-address links, especially if they ask for logins or payments.",
    evidence: [{ label: "Host", value: clip(url.hostname) }],
    confidence: "high",
    limitations: "This is an indicator, not proof of malicious intent.",
  };
}

function checkUserInfo(url: URL): Finding | null {
  if (url.username === "" && url.password === "") return null;

  const evidence = [
    { label: "Actual destination host", value: clip(url.hostname) },
    { label: "Username", value: clip(url.username) },
  ];
  // Never put a password into a report, even one the user typed themselves.
  if (url.password !== "") {
    evidence.push({ label: "Password", value: "(present, not shown)" });
  }

  return {
    id: "url.userinfo.present",
    category: "url",
    status: "warning",
    severity: "medium",
    title: "URL contains embedded credentials or a username",
    description:
      "The URL includes a username (and possibly a password) before the host, in the form user@host.",
    whyItMatters:
      "Browsers treat the part after the @ as the real destination. Attackers put a trusted-looking domain in front of it to mislead readers, for example https://bank.com@evil.example. Passwords in URLs also leak into logs and browser history.",
    recommendation:
      "Read the host after the @ before opening the link, and never put passwords in URLs.",
    evidence,
    confidence: "high",
    limitations: "Some legacy systems use this syntax legitimately.",
  };
}

function checkPunycode(url: URL): Finding | null {
  const labels = url.hostname.split(".");
  if (!labels.some((label) => label.startsWith("xn--"))) return null;

  return {
    id: "url.host.punycode",
    category: "url",
    status: "warning",
    severity: "low",
    title: "Domain uses internationalized (punycode) characters",
    description:
      "Part of the hostname is punycode (xn--), which encodes non-ASCII characters.",
    whyItMatters:
      "Attackers register look-alike domains using characters from other alphabets, such as a Cyrillic 'а' in place of a Latin 'a' (a homograph attack). Punycode itself is legitimate and widely used for non-English domains.",
    recommendation:
      "Compare the hostname carefully with the site you expect. If unsure, type the address yourself or use a bookmark.",
    evidence: [
      { label: "Host (ASCII form)", value: clip(url.hostname) },
      {
        label: "Unicode form (may resemble another domain)",
        value: clip(domainToUnicode(url.hostname) || "(unavailable)"),
      },
    ],
    confidence: "high",
    limitations:
      "Most internationalized domains are legitimate. This indicator alone is not evidence of an attack.",
  };
}

function checkSubdomains(url: URL): Finding | null {
  if (isIpHost(url.hostname)) return null;
  const labelCount = url.hostname.split(".").length;
  if (labelCount < MANY_SUBDOMAINS_THRESHOLD) return null;

  return {
    id: "url.host.many-subdomains",
    category: "url",
    status: "warning",
    severity: "low",
    title: "Hostname has many subdomain levels",
    description: `The hostname has ${labelCount} dot-separated parts.`,
    whyItMatters:
      "Long chains can push the real registered domain out of view, as in login.example.com.secure-check.evil.example. Some legitimate services also use deep hostnames.",
    recommendation:
      "Read the hostname from right to left. The registered domain sits just before the top-level ending, such as .com.",
    evidence: [
      { label: "Host", value: clip(url.hostname) },
      { label: "Label count", value: String(labelCount) },
    ],
    confidence: "low",
    limitations:
      "This uses a simple count without the Public Suffix List, so endings like .co.uk can make a hostname look deeper than it is.",
  };
}

function checkPort(url: URL): Finding | null {
  // The URL parser removes a port that is the default for the scheme,
  // so any port left here is non-default.
  if (url.port === "") return null;
  const scheme = url.protocol.replace(":", "");

  return {
    id: "url.port.non-default",
    category: "url",
    status: "warning",
    severity: "low",
    title: "URL uses a non-default port",
    description: `The URL specifies port ${url.port}, which is not the default for ${scheme}.`,
    whyItMatters:
      "Public websites normally use ports 80 (HTTP) and 443 (HTTPS). Other ports appear on development servers, admin panels, and some malicious hosting.",
    recommendation: "Confirm you expect this service before entering any information.",
    evidence: [{ label: "Port", value: url.port }],
    confidence: "high",
    limitations: "Many legitimate services run on other ports.",
  };
}

function checkDoubleEncoding(url: URL): Finding | null {
  if (!DOUBLE_ENCODING_PATTERN.test(url.pathname + url.search)) return null;

  return {
    id: "url.encoding.double",
    category: "url",
    status: "info",
    severity: "info",
    title: "URL contains double-encoded characters",
    description:
      "The path or query contains sequences like %252F, where a percent sign was itself encoded.",
    whyItMatters:
      "Double encoding is sometimes used to slip characters past filters that decode only once. It also appears in legitimate links that carry another URL as a parameter.",
    recommendation: "",
    evidence: [{ label: "Pattern", value: "%25 followed by two hex digits" }],
    confidence: "low",
    limitations: "Common in legitimate redirect and tracking links.",
  };
}

function noIndicatorsFinding(): Finding {
  return {
    id: "url.indicators.none",
    category: "url",
    status: "pass",
    severity: "info",
    title: "No suspicious URL characteristics observed",
    description:
      "None of the URL checks flagged this address: IP-address host, embedded credentials, punycode, many subdomains, non-default port, double encoding.",
    whyItMatters:
      "These traits are common in deceptive links, so seeing none is a useful but weak signal.",
    recommendation: "",
    evidence: [],
    confidence: "medium",
    limitations:
      "Absence of these traits does not mean the site is safe. Malicious sites often use ordinary-looking URLs.",
  };
}

/** Analyzes the text of a URL only. Makes no network requests. */
export function analyzeUrl(input: UrlAnalysisInput): Finding[] {
  const { url } = input;

  const indicators = [
    checkIpHost(url),
    checkUserInfo(url),
    checkPunycode(url),
    checkSubdomains(url),
    checkPort(url),
    checkDoubleEncoding(url),
  ].filter((finding): finding is Finding => finding !== null);

  return [
    checkSyntax(url),
    checkScheme(input),
    ...(indicators.length > 0 ? indicators : [noIndicatorsFinding()]),
  ];
}