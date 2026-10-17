import type { NextConfig } from "next";
import { buildSecurityHeaders } from "./src/lib/security/headers";

const nextConfig: NextConfig = {
  // Do not advertise the framework in an X-Powered-By header.
  poweredByHeader: false,

  // The scanner reads the local threat index at run time. Next.js only copies
  // files it can see being imported, and it cannot see a database opened by
  // path, so we name it here. Without this line a hosted scan function would
  // ship without its threat list.
  outputFileTracingIncludes: {
    "/api/scan": ["./data/threat-index.db"],
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