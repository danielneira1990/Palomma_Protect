import { LOGO_PALOMMA_BLANCO_BASE64 } from "./logo";

export const LOGO_CID = "logoPalomma";

export function logoAttachment(): { filename: string; content: Buffer; cid: string } {
  return {
    filename: "palomma.png",
    content: Buffer.from(LOGO_PALOMMA_BLANCO_BASE64, "base64"),
    cid: LOGO_CID,
  };
}

type Color = "morado" | "azul" | "verde";
const COLORES: Record<Color, { bg: string; border: string; titulo: string }> = {
  morado: { bg: "#F7F4FF", border: "#E6DCFB", titulo: "#4012AB" },
  azul: { bg: "#E8F1FD", border: "#CFE0FA", titulo: "#1565C0" },
  verde: { bg: "#E8F7F2", border: "#C3EBDD", titulo: "#1D9E75" },
};

/** Una caja de color con título, cuerpo y (opcional) botón. */
export function caja(
  color: Color,
  titulo: string,
  cuerpo: string,
  cta?: { texto: string; url: string },
): string {
  const c = COLORES[color];
  return `<div style="background:${c.bg};border:1px solid ${c.border};border-radius:12px;padding:18px 20px;margin-bottom:12px">
    <div style="font-size:13px;font-weight:700;color:${c.titulo};margin-bottom:8px">${titulo}</div>
    <p style="margin:0;font-size:13.5px;color:#18182A">${cuerpo}</p>
    ${cta ? `<div style="margin-top:16px"><a href="${cta.url}" style="display:inline-block;background:#4012AB;color:#fff;text-decoration:none;font-weight:700;font-size:13.5px;padding:11px 22px;border-radius:8px">${cta.texto}</a></div>` : ""}
  </div>`;
}

/** Una lista con viñetas moradas. */
export function lista(titulo: string, items: string[]): string {
  const filas = items
    .map(
      (t) =>
        `<tr><td style="padding:4px 0;vertical-align:top;color:#4012AB;font-weight:700">›</td><td style="padding:4px 0 4px 10px;color:#18182A">${t}</td></tr>`,
    )
    .join("");
  return `<div style="font-size:13px;font-weight:700;color:#0B0A1E;margin:4px 0 8px">${titulo}</div><table role="presentation" cellpadding="0" cellspacing="0" style="font-size:13.5px;line-height:1.5;margin-bottom:12px">${filas}</table>`;
}

/** Envuelve el contenido con el header (logo), el intro, el cierre y el footer. */
export function layoutCorreo(opts: {
  etiqueta: string;
  titulo: string;
  intro: string;
  contenido: string;
  cierre?: string;
}): string {
  const cierre = opts.cierre ?? "¿Dudas? Responde a este correo y te ayudamos. 💜";
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F5F7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18182A">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F7;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(11,10,30,.08)">
        <tr><td style="background:#4012AB;padding:26px 32px">
          <img src="cid:${LOGO_CID}" width="150" alt="Palomma Protect" style="display:block;border:0;height:auto">
          <div style="color:#C9BCF2;font-size:11px;letter-spacing:.08em;text-transform:uppercase;margin-top:8px">${opts.etiqueta}</div>
        </td></tr>
        <tr><td style="padding:32px 32px 8px">
          <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;letter-spacing:-.02em;color:#0B0A1E">${opts.titulo}</h1>
          <p style="margin:0;color:#6B6B7B;font-size:14px">${opts.intro}</p>
        </td></tr>
        <tr><td style="padding:20px 32px 4px">${opts.contenido}</td></tr>
        <tr><td style="padding:16px 32px 32px">
          <p style="margin:0 0 4px;font-size:13.5px;color:#18182A">${cierre}</p>
          <p style="margin:16px 0 0;font-size:13.5px;color:#18182A">Un saludo,<br><b>Equipo Palomma Protect</b></p>
        </td></tr>
        <tr><td style="padding:18px 32px;background:#FAFAFB;border-top:1px solid #ECECEF">
          <p style="margin:0;font-size:11px;color:#9494A3">Palomma S.A.S. · NIT 901.653.730-9 · www.palomma.com · Fianza de Arrendamiento</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;
}
