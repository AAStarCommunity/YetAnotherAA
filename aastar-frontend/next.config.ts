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
    // /kms-api/* is handled by the server-side route handler at app/kms-api/[...path]
    // (injects the KMS key server-side + diagnostics), not by a rewrite.
    return [
      {
        source: "/api/:path*",
        destination: `${backendUrl}/api/:path*`,
      },
    ];
  },
};

export default nextConfig;
