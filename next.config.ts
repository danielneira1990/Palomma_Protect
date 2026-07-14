import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // googleapis, nodemailer, exceljs y unpdf usan require dinámico; se externalizan.
  serverExternalPackages: ["googleapis", "nodemailer", "exceljs", "unpdf"],
  experimental: {
    // Subir el contrato firmado (PDF) por Server Action. Default 1MB.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
