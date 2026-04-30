import type { NextConfig } from "next";
import path from "path";

const securityHeaders = [
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "X-XSS-Protection", value: "1; mode=block" },
  { key: "X-Frame-Options", value: "SAMEORIGIN" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  {
    key: "Permissions-Policy",
    value: "camera=(), microphone=(), geolocation=()",
  },
  {
    key: "Strict-Transport-Security",
    value: "max-age=63072000; includeSubDomains; preload",
  },
];

const nextConfig: NextConfig = {
  // Hides the Next.js dev-tools indicator (the N logo in the bottom-left corner)
  devIndicators: false,

  // Turbopack alias (Next.js 16 default bundler)
  turbopack: {
    resolveAlias: {
      canvas: path.resolve(__dirname, "./canvas-stub.js"),
    },
  },

  // Webpack alias (fallback for --webpack flag or older builds)
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },

  async headers() {
    return [
      {
        source: "/(.*)",
        headers: securityHeaders,
      },
    ];
  },
};

export default nextConfig;
