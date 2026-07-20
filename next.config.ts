import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  poweredByHeader: false,
  experimental: {
    serverActions: {
      bodySizeLimit: "10mb",
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "pb-orderit.povoas.top",
      },
      {
        protocol: "https",
        hostname: "www.continente.pt",
      },
      {
        protocol: "https",
        hostname: "www.pingodoce.pt",
      },
    ],
  },
};

export default nextConfig;
