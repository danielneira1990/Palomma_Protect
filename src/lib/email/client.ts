import nodemailer from "nodemailer";

/**
 * Capa de envío de correo, aislada e intercambiable (como la de Supabase/Google).
 * Hoy usa SMTP (p. ej. Gmail con contraseña de aplicación); para la integración
 * real basta cambiar estas credenciales o el transporte, sin tocar la lógica.
 *
 * Devuelve null si no hay SMTP configurado, para que la app corra sin correo.
 */
function getMailer() {
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!host || !user || !pass) return null;

  const port = Number(process.env.SMTP_PORT ?? 465);
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465, // 465 = SSL; 587 = STARTTLS
    auth: { user, pass },
  });
}

export async function enviarCorreo(opts: {
  to: string;
  subject: string;
  html: string;
  attachments?: { filename: string; content: Buffer; cid?: string }[];
}): Promise<string | null> {
  const mailer = getMailer();
  if (!mailer) return null;

  const from = process.env.MAIL_FROM ?? process.env.SMTP_USER!;
  const info = await mailer.sendMail({ from, ...opts });
  return info.messageId ?? "sent";
}
