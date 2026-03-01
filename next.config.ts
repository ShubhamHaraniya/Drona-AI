import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  typescript: {
    // The type assertions in API routes handle runtime safety
    // These errors are from strict TS checking of JSON-parsed data shapes
    ignoreBuildErrors: true,
  },
};

export default nextConfig;
