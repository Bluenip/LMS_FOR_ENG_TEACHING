import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  serverExternalPackages: ["pdfjs-dist", "bcryptjs", "exceljs", "web-push", "nodemailer", "ioredis"],
  experimental: {
    serverActions: {
      bodySizeLimit: "25mb",
    },
  },
  webpack: (config) => {
    config.resolve.alias.canvas = false;
    return config;
  },
};

export default nextConfig;
