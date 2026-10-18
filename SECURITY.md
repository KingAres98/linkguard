# Security policy

LinkGuard is a defensive tool, so its own security matters. Thank you for
taking the time to report a problem responsibly.

## Reporting a vulnerability

**Please do not open a public issue for security problems.**

Report privately through GitHub instead: open the **Security** tab of this
repository and choose **Report a vulnerability**. Only the maintainer can see
the report.

A useful report includes:

- what the problem is and where it is (file, route or page)
- steps to reproduce it, using a test target you control
- what an attacker could achieve with it

## What to expect

LinkGuard is a personal, non-commercial project maintained by one person.
I aim to acknowledge reports within a week and to keep you updated while a fix
is in progress. With your permission, I will credit you when the fix is
released.

## Supported versions

Only the latest version on the `main` branch, and the live site built from it,
receives security fixes.

## In scope

- the scanner and its protections, such as the guard that stops LinkGuard from
  being used to reach private or internal network addresses
- the `/api/scan` and dashboard API routes, including input validation and
  rate limiting
- the website: security headers, content security policy, and the browser-side
  dashboard storage, backup and import
- the build and deployment setup in this repository, including handling of
  the threat-feed download address and other secrets

## Out of scope

- the accuracy of the third-party threat feeds (report those to the feed
  maintainers, listed in `THIRD_PARTY_NOTICES.md`)
- security problems LinkGuard *finds* on websites it scans (contact that
  site's owner)
- the hosting platform itself (Vercel) or GitHub
- denial of service by sending large volumes of traffic

## Testing guidelines

- Test against your own local copy where possible (`npm run dev`).
- If you test the live site, keep the request volume low, and do not use
  LinkGuard to scan targets you do not have permission to probe.
- Do not access, change or delete data that is not your own.