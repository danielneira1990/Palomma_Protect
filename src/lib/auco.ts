import { extractText, getDocumentProxy } from "unpdf";

/**
 * Validación de la firma electrónica de AUCO a partir del PDF firmado.
 *
 * AUCO agrega al final del documento una página "Certificado de firma" con,
 * por firmante: E-mail, Teléfono, método de autenticación ("Autenticado con:
 * Teléfono / Código OTP / Fotografía / Documento de identidad"), timestamp y
 * hash; y a nivel documento el "Número de documento" y el "Hash del documento".
 *
 * Como solo tenemos el PDF (no la API de AUCO), la cédula no viene como campo:
 * validamos que el firmante es el representante legal cruzando su **correo** y
 * **celular** contra el registro, y exigiendo que se haya usado el **método
 * fuerte** (OTP + foto + documento de identidad), con el que AUCO valida la
 * identidad biométricamente contra la cédula. El día que tengamos la API se
 * podrá además cruzar la cédula contra cc_representante.
 */

export type EvidenciaAuco = {
  esCertificado: boolean;
  docId: string | null; // Número de documento AUCO (ej. 7YMHH5BZNW)
  hash: string | null; // Hash SHA-256 del documento
  emails: string[]; // correos de los firmantes (minúsculas)
  telefonos: string[]; // celulares normalizados a 10 dígitos
  metodoFuerte: boolean; // hay OTP + (documento de identidad | fotografía)
  firmado: string | null; // primer timestamp "Firmado …" del certificado
};

export type ResultadoFirma = { ok: boolean; errores: string[]; evidencia: EvidenciaAuco };

/** Extrae el texto plano de un PDF (todas las páginas). */
export async function extraerTextoPdf(buffer: Buffer): Promise<string> {
  const pdf = await getDocumentProxy(new Uint8Array(buffer));
  const { text } = await extractText(pdf, { mergePages: true });
  return Array.isArray(text) ? text.join("\n") : text;
}

const ultimos10 = (s: string) => s.replace(/\D/g, "").slice(-10);

/**
 * Inserta un espacio después de las etiquetas conocidas, por si el extractor de
 * PDF pega la etiqueta al valor (ej. "E-mailfarias@…" → "E-mail farias@…").
 */
function normalizar(t: string): string {
  return t
    .replace(/E-?mail/gi, "E-mail ")
    .replace(/Tel[eé]fono/gi, "Teléfono ")
    .replace(/N[úu]mero de documento:?/gi, "Número de documento: ")
    .replace(/Hash del documento:?/gi, "Hash del documento: ")
    .replace(/Autenticado con:?/gi, "Autenticado con: ");
}

/** Parsea la evidencia del "Certificado de firma" de AUCO desde el texto del PDF. */
export function parsearEvidenciaAuco(texto: string): EvidenciaAuco {
  const t = normalizar(texto);
  // Varias señales por si el extractor de PDF altera el espaciado del título.
  const esCertificado =
    /auco/i.test(t) || /certificado de firma/i.test(t) || /hash de firmante/i.test(t);
  const docId = t.match(/N[úu]mero de documento:\s*([A-Z0-9]{6,})/i)?.[1] ?? null;
  const hash = t.match(/Hash del documento:\s*([a-f0-9]{32,})/i)?.[1] ?? null;

  const emails = [...new Set((t.match(/[\w.+-]+@[\w-]+\.[\w.-]+/g) ?? []).map((e) => e.toLowerCase()))];
  const telefonos = [
    ...new Set(
      (t.match(/\+?57\s?\d{10}|\b\d{10}\b/g) ?? []).map(ultimos10).filter((x) => x.length === 10),
    ),
  ];

  // Método fuerte: biometría/OTP presentes, no solo "Teléfono".
  const metodoFuerte = /\bOTP\b/i.test(t) && /(Documento de identidad|Fotograf[ií]a)/i.test(t);
  const firmado = t.match(/Firmado\s+([\d/]+,?\s*[\d:]+\s*GMT[-+]\d+)/i)?.[1] ?? null;

  return { esCertificado, docId, hash, emails, telefonos, metodoFuerte, firmado };
}

/**
 * Valida que el documento firmado (AUCO) corresponde a la firma del
 * representante legal de la inmobiliaria.
 */
export function validarFirmaRepresentante(
  evidencia: EvidenciaAuco,
  rep: { email: string | null; celular: string | null },
): ResultadoFirma {
  const errores: string[] = [];

  if (!evidencia.esCertificado) {
    errores.push(
      "El PDF no trae el certificado de firma de AUCO. Sube el documento firmado tal como lo devuelve AUCO.",
    );
    return { ok: false, errores, evidencia };
  }

  const repEmail = (rep.email ?? "").trim().toLowerCase();
  const repCel = ultimos10(rep.celular ?? "");

  if (!repEmail && !repCel) {
    errores.push(
      "La inmobiliaria no tiene correo ni celular del representante legal en registro. Complétalos antes de validar la firma.",
    );
  }
  if (repEmail && !evidencia.emails.includes(repEmail)) {
    errores.push(
      `El correo del firmante no coincide con el del representante legal en registro (${repEmail}).`,
    );
  }
  if (repCel && !evidencia.telefonos.includes(repCel)) {
    errores.push(
      `El celular del firmante no coincide con el del representante legal en registro (termina en …${repCel.slice(-4)}).`,
    );
  }
  if (!evidencia.metodoFuerte) {
    errores.push(
      "La firma no usó validación de identidad (OTP + foto + documento). El representante legal debe firmar con el método fuerte de AUCO.",
    );
  }

  return { ok: errores.length === 0, errores, evidencia };
}
