import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // googleapis y nodemailer usan require dinámico; se externalizan.
  serverExternalPackages: ["googleapis", "nodemailer"],
  experimental: {
    // Subir el contrato firmado (PDF) por Server Action. Default 1MB.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
