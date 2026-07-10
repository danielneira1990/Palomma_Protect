import { getGoogleClients } from "./client";

/**
 * Los tres "condicionados" de la fianza (reglamentos), como Google Docs en Drive.
 * Se exportan a PDF al vuelo para adjuntarlos al correo de bienvenida, así siempre
 * va la versión vigente. Los IDs (no secretos) vienen de env vars.
 */
const REGLAMENTOS = [
  {
    env: "GOOGLE_DRIVE_REGLAMENTO_GENERAL_ID",
    filename: "Reglamento de Condiciones Generales - Palomma.pdf",
  },
  {
    env: "GOOGLE_DRIVE_REGLAMENTO_INTEGRAL_ID",
    filename: "Reglamento de Fianza Integral - Palomma.pdf",
  },
  {
    env: "GOOGLE_DRIVE_REGLAMENTO_PENAL_ID",
    filename: "Reglamento de Clausula Penal - Palomma.pdf",
  },
];

export async function exportarReglamentosPdf(): Promise<
  { filename: string; content: Buffer }[]
> {
  const clients = getGoogleClients();
  if (!clients) return [];
  const { drive } = clients;

  const out: { filename: string; content: Buffer }[] = [];
  await Promise.all(
    REGLAMENTOS.map(async (r) => {
      const id = process.env[r.env];
      if (!id) return;
      const res = await drive.files.export(
        { fileId: id, mimeType: "application/pdf" },
        { responseType: "arraybuffer" },
      );
      out.push({ filename: r.filename, content: Buffer.from(res.data as ArrayBuffer) });
    }),
  );
  return out;
}
