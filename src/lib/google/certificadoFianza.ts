import { getGoogleClients } from "./client";
import { money, fecha } from "@/lib/format";
import { fmtTasaPct } from "@/lib/radicacion";

export type DatosCertificado = {
  numeroCertificado: string;
  razonSocial: string;
  nitInmobiliaria: string;
  codigoInmobiliaria: string;
  numContratoMarco: string;
  nombreArrendatario: string;
  documentoArrendatario: string;
  direccionInmueble: string;
  ciudadInmueble: string;
  numContratoArr: string;
  canon: number;
  valorAfianzadoCanon: number;
  tasaCanon: number;
  valorAfianzadoIntegral: number;
  fechaInicioContrato: string | null;
  fechaInicioFianza: string | null;
  fechaContratoMarco: string | null;
  deudoresSolidarios: string;
};

/**
 * Genera el certificado de fianza individual (PDF) a partir de la plantilla de
 * Google Docs. Es on-demand: copia la plantilla, rellena, exporta a PDF y borra
 * la copia temporal (no deja archivos en Drive). Devuelve el PDF, o null si
 * Google no está configurado.
 */
export async function generarCertificadoFianza(data: DatosCertificado): Promise<Buffer | null> {
  const clients = getGoogleClients();
  if (!clients) return null;
  const templateId = process.env.GOOGLE_DRIVE_TEMPLATE_CERTIFICADO_FIANZA_ID;
  if (!templateId) return null;

  const { drive, docs } = clients;
  const copy = await drive.files.copy({
    fileId: templateId,
    requestBody: { name: `Certificado ${data.numeroCertificado}` },
    fields: "id",
    supportsAllDrives: true,
  });
  const docId = copy.data.id!;

  try {
    const reemplazos: Record<string, string> = {
      "{{NUMERO_CERTIFICADO}}": data.numeroCertificado,
      "{{FECHA_EXPEDICION}}": fecha(new Date().toISOString()),
      "{{RAZON_SOCIAL_INMOBILIARIA}}": data.razonSocial,
      "{{NIT_INMOBILIARIA}}": data.nitInmobiliaria,
      "{{ID_INMOBILIARIA}}": data.codigoInmobiliaria,
      "{{ID_SOLICITUD_FIANZA}}": data.numeroCertificado,
      "{{NUMERO_CONTRATO_MARCO}}": data.numContratoMarco,
      "{{FECHA_CONTRATO_MARCO}}": fecha(data.fechaContratoMarco),
      "{{NOMBRE_ARRENDATARIO}}": data.nombreArrendatario,
      "{{IDENTIFICACION_ARRENDATARIO}}": data.documentoArrendatario,
      // La inmobiliaria contrata la fianza como mandataria del propietario, así
      // que no se requiere el nombre del propietario (ver contrato marco).
      "{{NOMBRE_PROPIETARIO}}": `${data.razonSocial} · mandataria`,
      "{{IDENTIFICACION_PROPIETARIO}}": data.nitInmobiliaria ? `NIT ${data.nitInmobiliaria}` : "—",
      "{{NOMBRE_DEUDORES_SOLIDARIOS}}": data.deudoresSolidarios || "—",
      "{{DIRECCION_INMUEBLE}}": data.direccionInmueble,
      "{{CIUDAD_INMUEBLE}}": data.ciudadInmueble || "—",
      "{{NUMERO_CONTRATO_ARR}}": data.numContratoArr || "—",
      "{{FECHA_INICIO_CONTRATO}}": fecha(data.fechaInicioContrato),
      "{{FECHA_INICIO_FIANZA}}": fecha(data.fechaInicioFianza),
      "{{VALOR_CANON}}": money(data.canon),
      "{{VALOR_AFIANZADO_CANON}}": money(data.valorAfianzadoCanon),
      "{{TASA_CANON}}": fmtTasaPct(data.tasaCanon),
      "{{VALOR_AFIANZADO_INTEGRAL}}": money(data.valorAfianzadoIntegral),
      "{{TASA_INTEGRAL}}": "Cortesía",
      "{{VALOR_AFIANZADO_PENAL}}": "No contratada",
      "{{TASA_PENAL}}": "—",
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
    return Buffer.from(exported.data as ArrayBuffer);
  } finally {
    try {
      await drive.files.delete({ fileId: docId, supportsAllDrives: true });
    } catch {
      /* copia temporal: mejor esfuerzo */
    }
  }
}
