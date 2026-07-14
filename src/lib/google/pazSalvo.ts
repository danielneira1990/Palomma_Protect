import { Readable } from "node:stream";
import { getGoogleClients } from "./client";

export type DatosPazSalvo = {
  razonSocial: string;
  nit: string;
  representanteLegal: string;
  ccRepresentante: string;
  ciudad: string;
  numContratos: number;
  valorAsegurado: number;
  nombreArchivoExcel: string;
  dia: string;
  mes: string;
  anio: string;
};

/**
 * Genera el paz y salvo de inducción a partir de la plantilla de Google Docs:
 * copia, rellena los marcadores y exporta a PDF. Devuelve el PDF (para descarga)
 * y el link en Drive. null si Google no está configurado.
 */
export async function generarPazYSalvo(
  data: DatosPazSalvo,
  folderId: string,
): Promise<{ pdf: Buffer; link: string } | null> {
  const clients = getGoogleClients();
  if (!clients) return null;

  const templateId = process.env.GOOGLE_DRIVE_TEMPLATE_PAZ_SALVO_ID;
  if (!templateId) return null;

  const { drive, docs } = clients;
  const nombre = `Paz y Salvo — ${data.razonSocial}`;

  const copy = await drive.files.copy({
    fileId: templateId,
    requestBody: { name: nombre, parents: [folderId] },
    fields: "id",
    supportsAllDrives: true,
  });
  const docId = copy.data.id!;

  const valor = "$ " + (data.valorAsegurado || 0).toLocaleString("es-CO");
  const reemplazos: Record<string, string> = {
    "{{CIUDAD}}": data.ciudad,
    "{{DIA}}": data.dia,
    "{{MES}}": data.mes,
    "{{ANIO}}": data.anio,
    "{{RAZON_SOCIAL_INMOBILIARIA}}": data.razonSocial,
    "{{NIT_INMOBILIARIA}}": data.nit,
    "{{NOMBRE_REPRESENTANTE_LEGAL}}": data.representanteLegal,
    "{{IDENTIFICACION_REPRESENTANTE}}": data.ccRepresentante,
    "{{NOMBRE_ARCHIVO_EXCEL}}": data.nombreArchivoExcel,
    // Dos marcadores limpios e independientes para la declaración juramentada.
    "{{NUMERO_CONTRATOS}}": String(data.numContratos),
    "{{VALOR_ASEGURADO}}": valor,
  };
  await docs.documents.batchUpdate({
    documentId: docId,
    requestBody: {
      requests: Object.entries(reemplazos).map(([find, replace]) => ({
        replaceAllText: {
          containsText: { text: find, matchCase: true },
          replaceText: replace || "—",
        },
      })),
    },
  });

  const exported = await drive.files.export(
    { fileId: docId, mimeType: "application/pdf" },
    { responseType: "arraybuffer" },
  );
  const pdf = Buffer.from(exported.data as ArrayBuffer);

  const up = await drive.files.create({
    requestBody: {
      name: `${nombre}.pdf`,
      parents: [folderId],
      mimeType: "application/pdf",
    },
    media: { mimeType: "application/pdf", body: Readable.from(pdf) },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });

  return { pdf, link: up.data.webViewLink ?? "" };
}
