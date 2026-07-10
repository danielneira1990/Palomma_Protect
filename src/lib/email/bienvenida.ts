import { LOGO_PALOMMA_BLANCO_BASE64 } from "./logo";

export type DatosBienvenida = {
  razonSocial: string;
  nombreContacto: string;
  emailContacto: string;
  portalUrl: string;
};

export type CorreoArmado = {
  subject: string;
  html: string;
  attachments: { filename: string; content: Buffer; cid: string }[];
};

const LOGO_CID = "logoPalomma";

/**
 * Correo de bienvenida a la inmobiliaria (HTML email-safe, estilos en línea).
 * Copy basado en la plantilla de Drive, con énfasis en inducciones y preaprobados.
 * El logo se embebe vía cid (los correos no renderizan SVG de forma confiable).
 */
export function correoBienvenida(data: DatosBienvenida): CorreoArmado {
  const nombre = data.nombreContacto?.trim() || "equipo";
  const subject = `¡Bienvenidos a Palomma Protect, ${data.razonSocial}!`;

  const puede = [
    "Solicitar estudios de nuevos arrendatarios.",
    "Cargar inducciones de contratos que ya administran.",
    "Ingresar contratos a fianza y descargar sus certificados.",
    "Reportar novedades y siniestros.",
    "Ver el detalle mensual de su facturación.",
  ];

  const items = puede
    .map(
      (t) =>
        `<tr><td style="padding:4px 0;vertical-align:top;color:#4012AB;font-weight:700">›</td><td style="padding:4px 0 4px 10px;color:#18182A">${t}</td></tr>`,
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
          <div style="color:#C9BCF2;font-size:11px;letter-spacing:.08em;text-transform:uppercase;margin-top:8px">Protect · Fianza de Arrendamiento</div>
        </td></tr>

        <tr><td style="padding:32px 32px 8px">
          <h1 style="margin:0 0 6px;font-size:22px;font-weight:800;letter-spacing:-.02em;color:#0B0A1E">¡Bienvenidos, ${data.razonSocial}!</h1>
          <p style="margin:0;color:#6B6B7B;font-size:14px">Hola ${nombre}, recibimos su Contrato Marco firmado y oficialmente quedan activos en Palomma Protect. 🎉</p>
        </td></tr>

        <tr><td style="padding:20px 32px 0">
          <div style="background:#F7F4FF;border:1px solid #E6DCFB;border-radius:12px;padding:18px 20px">
            <div style="font-size:13px;font-weight:700;color:#4012AB;margin-bottom:10px">Empiecen a operar</div>
            <p style="margin:0 0 6px;font-size:13.5px;color:#18182A">Ingresen al portal e inicien sesión con Google usando <b>${data.emailContacto}</b>. Su rol es <b>Admin</b>, con acceso completo al portafolio de ${data.razonSocial}.</p>
            <div style="margin-top:16px">
              <a href="${data.portalUrl}" style="display:inline-block;background:#4012AB;color:#fff;text-decoration:none;font-weight:700;font-size:13.5px;padding:11px 22px;border-radius:8px">Entrar al portal →</a>
            </div>
          </div>
        </td></tr>

        <tr><td style="padding:24px 32px 0">
          <div style="font-size:13px;font-weight:700;color:#0B0A1E;margin-bottom:8px">¿Qué pueden hacer desde ya?</div>
          <table role="presentation" cellpadding="0" cellspacing="0" style="font-size:13.5px;line-height:1.5">${items}</table>
        </td></tr>

        <tr><td style="padding:22px 32px 0">
          <div style="background:#E8F1FD;border:1px solid #CFE0FA;border-radius:12px;padding:16px 20px">
            <div style="font-size:13px;font-weight:700;color:#1565C0;margin-bottom:4px">Ya tienen preaprobados esperándolos</div>
            <p style="margin:0;font-size:13.5px;color:#18182A">Tienen solicitudes <b>ya preaprobadas</b> para entrar a la fianza con una <b>tasa especial</b>. Ingresen a la plataforma de <b>Pay</b> para conocerlas y activarlas — es fácil y desde el mismo portal. Y si quieren <b>hacer una inducción</b> de los contratos que ya administran y que no están preaprobados, también lo pueden hacer ahí mismo.</p>
          </div>
        </td></tr>

        <tr><td style="padding:24px 32px 32px">
          <p style="margin:0 0 14px;font-size:12.5px;color:#6B6B7B">📎 Adjuntamos los reglamentos de la fianza —condiciones generales, integral y cláusula penal— para su referencia.</p>
          <p style="margin:0 0 4px;font-size:13.5px;color:#18182A">¿Dudas? Respondan a este correo y los ayudamos a empezar.</p>
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
