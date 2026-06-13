import type { NextConfig } from "next";
import path from "path";

/** @type {import('next').NextConfig} */
const nextConfig: NextConfig = {
  typescript: {
    ignoreBuildErrors: true,
  },
  // Only use standalone output when explicitly enabled (e.g., for Docker builds)
  // Set NEXT_BUILD_STANDALONE=true when building for Docker
  // This prevents warnings when using 'npm run start' locally
  ...(process.env.NEXT_BUILD_STANDALONE === "true" && {
    output: "standalone",
    outputFileTracingRoot: path.join(__dirname, ".."),
  }),
  async rewrites() {
    const backendUrl = process.env.BACKEND_API_URL || "http://127.0.0.1:3000";
    const kmsUrl = process.env.KMS_PROXY_URL || "https://kms1.aastar.io";
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
      {
        source: "/kms-api/:path*",
        destination: `${kmsUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
