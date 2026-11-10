import type { NextConfig } from "next";

/**
 * TV compatibility note:
 * The `/display/[slug]` page runs on Samsung Smart TV browsers. Tizen 5.5 (2020 models)
 * ships Chromium 69, which is why package.json "browserslist" includes `chrome >= 69`.
 * Older Tizen firmware (Chromium 56/63) is NOT supported by the Next.js runtime; use an
 * external Android TV / mini PC kiosk browser for those models (see PRD §5.7).
 * Always validate on the actual TV hardware before production approval.
 */
const nextConfig: NextConfig = {
  output: "standalone",
  reactStrictMode: true,
  poweredByHeader: false,
  // During local development (without nginx) proxy API + WS calls to the backend.
  async rewrites() {
    const backend = process.env.BACKEND_INTERNAL_URL;
    if (!backend) return [];
    return [{ source: "/api/:path*", destination: `${backend}/api/:path*` }];
  },
};

export default nextConfig;
