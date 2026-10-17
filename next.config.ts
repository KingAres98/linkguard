import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  // Do not advertise the framework in an X-Powered-By header.
  poweredByHeader: false,

  // The scanner reads the local threat index at run time. Next.js only copies
  // files it can see being imported, and it cannot see (a) a database opened
  // by path or (b) the prebuilt SQLite add-on that better-sqlite3 picks by
  // operating system when it starts. Without these lines a hosted scan
  // function would ship without its threat list, or without the code needed
  // to read it. Hosting runs Linux, so only the Linux add-ons are included
  // (the Windows and macOS ones would just add weight).
  outputFileTracingIncludes: {
    "/api/scan": [
      "./data/threat-index.db",
      "./node_modules/better-sqlite3/prebuilds/linux-*.node",
    ],
  },

  async headers() {
    return [
      {
        source: "/:path*",
        headers: buildSecurityHeaders(process.env.NODE_ENV === "production"),
      },
    ];
  },
};

export default nextConfig;