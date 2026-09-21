import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Railway-friendly: produce a standalone server build
  output: "standalone",
  experimental: {
    // The dev server's persistent Turbopack cache grew past 400 MB in a day on a nearly full disk.
    // It only speeds up dev restarts; production builds are unaffected.
    turbopackFileSystemCacheForDev: false,
  },
};

export default nextConfig;
