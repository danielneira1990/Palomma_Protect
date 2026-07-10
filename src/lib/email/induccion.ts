import { LOGO_PALOMMA_BLANCO_BASE64 } from "./logo";

export type DatosInduccion = {
  razonSocial: string;
  nombreContacto: string;
  numClientes: number;
};

export type CorreoArmado = {
  subject: string;
  html: string;
  attachments: { filename: string; content: Buffer; cid?: string }[];
};

const LOGO_CID = "logoPalomma";

/**
 * Correo de inicio del proceso de inducción/radicación (HTML email-safe).
 * Explica los pasos y lleva adjunto el Excel de radicación prellenado.
 */
export function correoInduccion(data: DatosInduccion): CorreoArmado {
  const nombre = data.nombreContacto?.trim() || "equipo";
  const subject = `¡Empecemos tu radicación en Palomma Protect, ${data.razonSocial}!`;

  const pasos = [
    "Descarga el <b>Excel de radicación</b> (va adjunto) — tus clientes ya vienen prellenados.",
    "Completa los datos del contrato (canon, dirección, fechas) y los <b>codeudores</b>.",
    "Sube el Excel completado en el portal.",
    "Firma el <b>paz y salvo</b> que generamos con tu radicación.",
    "Al completar el proceso, tus contratos quedan <b>afianzados</b>. 🎉",
  ];

  const items = pasos
    .map(
      (t, i) =>
        `<tr><td style="padding:5px 0;vertical-align:top;color:#4012AB;font-weight:800;width:22px">${i + 1}.</td><td style="padding:5px 0 5px 6px;color:#18182A">${t}</td></tr>`,
    )
    .join("");

  const html = `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#F5F5F7;font-family:-apple-system,Segoe UI,Roboto,Helvetica,Arial,sans-serif;color:#18182A">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#F5F5F7;padding:24px 12px">
    <tr><td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:14px;overflow:hidden;box-shadow:0 1px 3px rgba(11,10,30,.08)">

        <tr><td style="background:#4012AB;padding:26px 32px">
          <img src="cid:${LOGO_CID}" width="150" alt="Palomma Protect" style="display:block;border:0;height:auto">
          <div style="color:#C9BCF2;font-size:11px;letter-spacing:.08em;text-transform:uppercase;margin-top:8px">Protect · Proceso de inducción</div>
        </td></tr>

        <tr><td style="padding:32px 32px 8px">
          <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;letter-spacing:-.02em;color:#0B0A1E">¡Bienvenido a tu proceso de inducción!</h1>
          <p style="margin:0;color:#6B6B7B;font-size:14px">Hola ${nombre}, seleccionaste <b>${data.numClientes} cliente(s)</b> preaprobado(s) para afianzar. Te explicamos cómo va el proceso 👇</p>
        </td></tr>

        <tr><td style="padding:20px 32px 0">
          <div style="background:#F7F4FF;border:1px solid #E6DCFB;border-radius:12px;padding:18px 20px">
            <div style="font-size:13px;font-weight:700;color:#4012AB;margin-bottom:10px">Los pasos</div>
            <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:13.5px;line-height:1.5">${items}</table>
          </div>
        </td></tr>

        <tr><td style="padding:22px 32px 0">
          <div style="background:#E8F1FD;border:1px solid #CFE0FA;border-radius:12px;padding:16px 20px">
            <div style="font-size:13px;font-weight:700;color:#1565C0;margin-bottom:4px">📎 Tu Excel de radicación va adjunto</div>
            <p style="margin:0;font-size:13.5px;color:#18182A">Con tus ${data.numClientes} cliente(s) ya prellenados. También lo puedes descargar desde el portal cuando quieras.</p>
          </div>
        </td></tr>

        <tr><td style="padding:24px 32px 32px">
          <p style="margin:0 0 4px;font-size:13.5px;color:#18182A">¿Dudas? Responde a este correo y te ayudamos.</p>
          <p style="margin:16px 0 0;font-size:13.5px;color:#18182A">Un saludo,<br><b>Equipo Palomma Protect</b></p>
        </td></tr>

        <tr><td style="padding:18px 32px;background:#FAFAFB;border-top:1px solid #ECECEF">
          <p style="margin:0;font-size:11px;color:#9494A3">Palomma S.A.S. · NIT 901.653.730-9 · www.palomma.com · Fianza de Arrendamiento</p>
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
