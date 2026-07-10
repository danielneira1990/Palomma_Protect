import { LOGO_PALOMMA_BLANCO_BASE64 } from "./logo";

export type DatosContratoMarcoEmail = {
  razonSocial: string;
  nombreContacto: string;
  contratoLink?: string;
};

export type CorreoArmado = {
  subject: string;
  html: string;
  attachments: { filename: string; content: Buffer; cid?: string }[];
};

const LOGO_CID = "logoPalomma";

/**
 * Correo de creación: le llega a la inmobiliaria su Contrato Marco para firma.
 * El PDF se adjunta desde el que la llama (la generación). Distinto del correo
 * de bienvenida, que va cuando ya subieron el contrato firmado (activación).
 */
export function correoContratoMarco(data: DatosContratoMarcoEmail): CorreoArmado {
  const nombre = data.nombreContacto?.trim() || "equipo";
  const subject = `Tu Contrato Marco de Palomma Protect · ${data.razonSocial}`;

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F5F7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18182A">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F7;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(11,10,30,.08)">

        <tr><td style="background:#4012AB;padding:26px 32px">
          <img src="cid:${LOGO_CID}" width="150" alt="Palomma Protect" style="display:block;border:0;height:auto">
          <div style="color:#C9BCF2;font-size:11px;letter-spacing:.08em;text-transform:uppercase;margin-top:8px">Protect · Contrato Marco</div>
        </td></tr>

        <tr><td style="padding:32px 32px 8px">
          <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;letter-spacing:-.02em;color:#0B0A1E">¡Bienvenidos, ${data.razonSocial}!</h1>
          <p style="margin:0;color:#6B6B7B;font-size:14px">Hola ${nombre}, adjuntamos su <b>Contrato Marco de Fianza</b> con Palomma Protect.</p>
        </td></tr>

        <tr><td style="padding:20px 32px 0">
          <div style="background:#F7F4FF;border:1px solid #E6DCFB;border-radius:12px;padding:18px 20px">
            <div style="font-size:13px;font-weight:700;color:#4012AB;margin-bottom:8px">📎 Su Contrato Marco (referencia)</div>
            <p style="margin:0;font-size:13.5px;color:#18182A">Adjuntamos su Contrato Marco de Fianza <b>como referencia</b> para que lo revisen con calma. En los <b>próximos minutos/horas les llegará el documento para firma digital</b>. Una vez firmado, su cuenta queda <b>activa</b> y podrán empezar a afianzar su cartera.</p>
            ${
              data.contratoLink
                ? `<div style="margin-top:14px"><a href="${data.contratoLink}" style="display:inline-block;background:#4012AB;color:#fff;text-decoration:none;font-weight:700;font-size:13.5px;padding:11px 22px;border-radius:8px">Ver el contrato →</a></div>`
                : ""
            }
          </div>
        </td></tr>

        <tr><td style="padding:24px 32px 32px">
          <p style="margin:0 0 4px;font-size:13.5px;color:#18182A">¿Dudas? Responda a este correo y lo ayudamos.</p>
          <p style="margin:16px 0 0;font-size:13.5px;color:#18182A">Un saludo,<br><b>Equipo Palomma Protect</b></p>
        </td></tr>

        <tr><td style="padding:18px 32px;background:#FAFAFB;border-top:1px solid #ECECEF">
          <p style="margin:0;font-size:11px;color:#9494A3">Palomma S.A.S. · NIT 901.653.730-9 · www.palomma.com · Fianza de Arrendamiento · Ley 527 de 1999</p>
        </td></tr>

      </table>
    </td></tr>
  </table>
</body></html>`;

  return {
    subject,
    html,
    attachments: [
      {
        filename: "palomma.png",
        content: Buffer.from(LOGO_PALOMMA_BLANCO_BASE64, "base64"),
        cid: LOGO_CID,
      },
    ],
  };
}
