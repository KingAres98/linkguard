# Design decisions

Some LinkGuard behavior looks like a missing feature but is deliberate. This page
explains the reasoning, so each choice can be judged on its merits instead of
being "fixed" by mistake.

## 1. LinkGuard never says a site is "safe"

A scan observes a snapshot: configuration (DNS, TLS, headers, redirects) and
whether a domain appears in threat lists we check. Finding nothing wrong is not
proof of safety, so no label claims it. The strongest positive label is
"Good Configuration Observed", and a test enforces that no posture label can
imply safety.

- **The worst finding decides the posture, never an average.** One critical
  issue must not be diluted by many passing checks.
- **No percentage scores.** A number like "92%" suggests precision we do not have.
- **Every finding carries evidence, a recommendation, and "what we cannot
  conclude".** A verdict without its evidence is just an assertion.
- **"Not listed" in threat feeds is informational, not a pass.** Absence from a
  list only means the domain is not on that list today.
- **Missing or stale feed data reports "could not check"**, never "not listed".

## 2. Your data stays in your browser

In the public (browser) mode, tracked domains and scan history live in your own
browser (IndexedDB). The server stores nothing per user: no accounts, no
database of people's domains.

- **Privacy:** there is no server-side list of what you track.
- **Cost:** no per-user storage keeps hosting close to free.
- **What does leave your browser:** the domain name, sent to LinkGuard when you
  press Scan, so the server can run the checks. Results are saved locally only.
- **Consequences, accepted on purpose:** clearing site data deletes your data,
  and there is no sync between devices. Export and import (below) cover both.
- **Owner mode** (server-side SQLite) exists for running LinkGuard on your own
  machine. It is off in public mode, and its API returns 404 there.

## 3. Threat intelligence is a local, multi-source index

Threat feeds are downloaded into a local index and checked there, instead of
asking a third-party service about each domain.

- **Privacy:** domains you check are not sent to a lookup service.
- **Cost and speed:** free, and a lookup is a local read.
- **Cross-checking:** results report how many of the checked feeds list a domain,
  so no single source is treated as the truth.
- **Licensing:** each installation downloads its own copy under each feed's own
  terms, and LinkGuard never redistributes feed data. Services whose terms forbid
  this kind of use were not adopted. Re-check every feed's terms before any
  commercial use.
- **Fail closed:** a refresh that downloads too little, or shrinks the list
  suddenly, is rejected and the previous data is kept.
- **Matching is by registrable domain, aware of the public suffix list**, so
  `x.github.io` and `y.github.io` are different sites.
- **IP addresses are not matched**, because the feeds are domain lists.

## 4. Three export files, three jobs

| File | Contains | Use it to |
|---|---|---|
| **Backup (.json)** | Domains, full scan reports with every finding and evidence, original dates | Restore everything, or move to another device |
| **Domain names (.txt)** | Names only, one per line | Share or reuse in other tools that read plain lists |
| **Summary (.csv)** | Domain, date added, latest posture label, last scan date | Read at a glance in a spreadsheet |

**Why the TXT and CSV do not restore status or dates.** A posture label is a
conclusion drawn from specific evidence in a specific scan. Restoring the label
without the scan behind it would display a verdict with nothing supporting it, and
a hand-edited file could claim anything. A date alone would look like data while
meaning nothing. Only the backup carries full reports, and every finding in it is
validated on import, so it is the only file that restores history.

**Why the TXT is names only.** It is deliberately the lowest common denominator
that other tools accept. Extra columns would be read as junk by many of them.

## 5. Import is merge-only and validated

Importing never overwrites. A preview shows what would change before anything is
saved.

- Domains you already track are left unchanged.
- A tracked domain that already has history keeps it; imported scans for it are
  left out.
- New domains are added, with their history if the backup has it.
- **Backups are validated strictly:** a format marker and version, size and count
  limits, every hostname re-checked, every finding checked against the allowed
  values. Error messages never repeat file content.
- **Domain lists are read tolerantly** (plain text, hosts files, ad-blocker
  lists, CSV or TSV with a header, JSON, URLs) so lists from other tools work, but
  each entry must be a real domain with a known ending. IP addresses and
  `localhost` are dropped.
- **Limits:** 25 tracked domains, 20 saved scans per domain, 5 MB per backup,
  1 MB per list. They keep storage small and scanning polite.
- **Files are read in your browser** and never uploaded.

## 6. What can be scanned

- Tracked domains must be domain names, not IP addresses.
- The scanner refuses loopback, private, and link-local targets (SSRF
  protection). This is why `127.0.0.1` and local addresses cannot be scanned: a
  public scanner must not become a way to probe internal networks.
- Scans make ordinary requests only: DNS lookups, a TLS handshake, and normal web
  requests. There is no port scanning and no exploit attempts.

## 7. Secrets and logging

- Full URLs are never logged, since they can carry sensitive query strings.
- Error messages are fixed strings and never echo the input.
- Feed download keys live in `.env.local`, are redacted from errors, and are never
  committed. `.env.example` documents the settings without values.
- All external data (feeds, headers, DNS, certificates, import files) is treated
  as untrusted and rendered as plain text, never as markup.

  
## 8. Abuse protection on the scan endpoint

In public mode, `/api/scan` is the one open door to the server, and every scan
makes outbound requests. It is protected in three layers:

- **Per client:** at most 30 scans per 10 minutes.
- **Per target:** at most 6 scans of the same site per minute, across all
  clients. A defensive tool must never become a way to hammer a third party.
- **Concurrency:** at most 4 scans run at once; others get a "busy, try again"
  response.

**Why client identification is opt-in.** A plain request carries no reliable
address, and headers such as `X-Forwarded-For` can be faked unless a trusted
proxy sets them. The operator names the one header their proxy sets
(`LINKGUARD_CLIENT_IP_HEADER`). Without it, all clients share one budget: fine for
local use and still protective of the server, though not fair per person.

**Known limits.** Counters live in memory, so they cover one server process; edge
rate limiting at the host (decided in the deployment phase) is the complement. A
flood of fake client identities could also push honest ones out of the counter
table, which is why the per-target and concurrency layers exist independently.

## 9. Browser security headers

Every response carries a Content Security Policy that only allows our own origin,
forbids framing, plugins, and off-site form posts, plus `nosniff`, a strict
referrer policy, a locked-down permissions policy, and (in production) HSTS.

**One accepted compromise.** The policy allows inline scripts, because Next.js
ships small inline scripts for hydration. A nonce-based policy would be stricter.
This is acceptable for now because the app renders no untrusted HTML (React
escapes all text, and `dangerouslySetInnerHTML` is not used), so the CSP is a
second layer rather than the only defense. Moving to nonces is a candidate for a
later hardening pass.