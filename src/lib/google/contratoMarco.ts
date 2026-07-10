import { Readable } from "node:stream";
import { getGoogleClients } from "./client";

export type DatosContratoMarco = {
  codigo: string; // IMB-AAAA-NNN
  numContratoMarco: string; // CMF-AAAA-NNN
  razonSocial: string;
  nit: string;
  ciudad: string;
  representanteLegal: string;
  ccRepresentante: string;
  fechaSuscripcion: string; // "9 de julio de 2026"
};

export type ContratoMarcoGenerado = {
  folderId: string;
  docId: string; // Google Doc editable
  pdfId: string;
  pdfLink: string;
  pdf: Buffer; // el PDF exportado, para adjuntarlo por correo
};

/**
 * Genera el Contrato Marco de una inmobiliaria en Google Drive:
 *   1. crea una subcarpeta por inmobiliaria dentro de "Inmobiliarias",
 *   2. copia la plantilla y rellena los marcadores {{...}} con los datos,
 *   3. exporta el resultado a PDF y lo deja junto al Doc editable.
 *
 * Devuelve null si la integración de Google no está configurada (sin credencial
 * o sin IDs de plantilla/carpeta), para que la creación de la inmobiliaria no
 * dependa de esto.
 */
export async function generarContratoMarco(
  data: DatosContratoMarco,
): Promise<ContratoMarcoGenerado | null> {
  const clients = getGoogleClients();
  if (!clients) return null;

  const templateId = process.env.GOOGLE_DRIVE_TEMPLATE_CONTRATO_MARCO_ID;
  const parentFolderId = process.env.GOOGLE_DRIVE_INMOBILIARIAS_FOLDER_ID;
  if (!templateId || !parentFolderId) return null;

  const { drive, docs } = clients;

  // 1. Subcarpeta por inmobiliaria: "IMB-2026-001 — Indika Inmobiliaria S.A.S.".
  const folder = await drive.files.create({
    requestBody: {
      name: `${data.codigo} — ${data.razonSocial}`,
      mimeType: "application/vnd.google-apps.folder",
      parents: [parentFolderId],
    },
    fields: "id",
    supportsAllDrives: true,
  });
  const folderId = folder.data.id!;

  // 2. Copiar la plantilla del contrato marco dentro de la subcarpeta.
  const docName = `${data.numContratoMarco} — Contrato Marco — ${data.razonSocial}`;
  const copy = await drive.files.copy({
    fileId: templateId,
    requestBody: { name: docName, parents: [folderId] },
    fields: "id",
    supportsAllDrives: true,
  });
  const docId = copy.data.id!;

  // 3. Reemplazar los marcadores por los datos de la inmobiliaria.
  const reemplazos: Record<string, string> = {
    "{{NUMERO_CONTRATO}}": data.numContratoMarco,
    "{{FECHA_SUSCRIPCION}}": data.fechaSuscripcion,
    "{{RAZON_SOCIAL_INMOBILIARIA}}": data.razonSocial,
    "{{NIT_INMOBILIARIA}}": data.nit,
    "{{CIUDAD_INMOBILIARIA}}": data.ciudad,
    "{{NOMBRE_REPRESENTANTE_LEGAL}}": data.representanteLegal,
    "{{CC_REPRESENTANTE_LEGAL}}": data.ccRepresentante,
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

  // 4. Exportar a PDF y subirlo a la misma subcarpeta.
  const exported = await drive.files.export(
    { fileId: docId, mimeType: "application/pdf" },
    { responseType: "arraybuffer" },
  );
  const pdfBuffer = Buffer.from(exported.data as ArrayBuffer);
  const pdf = await drive.files.create({
    requestBody: {
      name: `${docName}.pdf`,
      parents: [folderId],
      mimeType: "application/pdf",
    },
    media: { mimeType: "application/pdf", body: Readable.from(pdfBuffer) },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });

  return {
    folderId,
    docId,
    pdfId: pdf.data.id!,
    pdfLink: pdf.data.webViewLink ?? "",
    pdf: pdfBuffer,
  };
}

/**
 * Sube el Contrato Marco firmado a la subcarpeta de la inmobiliaria en Drive.
 * Si no tenemos el folderId guardado (inmobiliarias creadas antes de este flujo),
 * lo ubica por nombre o lo crea. Devuelve null si Google no está configurado.
 */
export async function subirContratoFirmadoADrive(params: {
  folderId: string | null;
  codigo: string;
  razonSocial: string;
  numContratoMarco: string;
  buffer: Buffer;
  mimeType: string;
}): Promise<{ fileId: string; link: string; folderId: string } | null> {
  const clients = getGoogleClients();
  if (!clients) return null;
  const { drive } = clients;

  let folderId = params.folderId;

  // Fallback: ubicar (o crear) la subcarpeta si no la tenemos guardada.
  if (!folderId) {
    const parentFolderId = process.env.GOOGLE_DRIVE_INMOBILIARIAS_FOLDER_ID;
    if (!parentFolderId) return null;
    const name = `${params.codigo} — ${params.razonSocial}`;
    const found = await drive.files.list({
      q: `'${parentFolderId}' in parents and name = '${name.replace(/'/g, "\\'")}' and mimeType = 'application/vnd.google-apps.folder' and trashed = false`,
      fields: "files(id)",
      supportsAllDrives: true,
      includeItemsFromAllDrives: true,
    });
    folderId = found.data.files?.[0]?.id ?? null;
    if (!folderId) {
      const folder = await drive.files.create({
        requestBody: {
          name,
          mimeType: "application/vnd.google-apps.folder",
          parents: [parentFolderId],
        },
        fields: "id",
        supportsAllDrives: true,
      });
      folderId = folder.data.id!;
    }
  }

  const uploaded = await drive.files.create({
    requestBody: {
      name: `${params.numContratoMarco} — Contrato Marco FIRMADO — ${params.razonSocial}.pdf`,
      parents: [folderId],
      mimeType: params.mimeType,
    },
    media: { mimeType: params.mimeType, body: Readable.from(params.buffer) },
    fields: "id, webViewLink",
    supportsAllDrives: true,
  });

  return {
    fileId: uploaded.data.id!,
    link: uploaded.data.webViewLink ?? "",
    folderId,
  };
}
