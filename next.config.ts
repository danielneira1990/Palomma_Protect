import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // googleapis, nodemailer y exceljs usan require dinámico; se externalizan.
  serverExternalPackages: ["googleapis", "nodemailer", "exceljs"],
  experimental: {
    // Subir el contrato firmado (PDF) por Server Action. Default 1MB.
    serverActions: { bodySizeLimit: "10mb" },
  },
};

export default nextConfig;
